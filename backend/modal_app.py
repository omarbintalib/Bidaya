"""
Deploy the backend to Modal (serverless GPU, scales to zero: no visitors = no cost).

    pip install modal && modal token new                        # once: log in
    modal secret create bidayah-openai OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-6-luna OPENAI_ROUTER_MODEL=gpt-6-luna
    cd backend && modal deploy modal_app.py                       # prints https://<workspace>--bidayah-api-serve.modal.run

The image bakes in both models (bge-m3, bge-reranker-v2-m3) and the corpus embeddings (built once on a GPU at
deploy time), so a cold start only loads them: roughly 20-60 s for the first question after the app has been
idle, then ~4 s per answer. The frontend pings /api/health when the page opens, so the backend is usually awake
by the time a visitor asks.
"""
from pathlib import Path

import modal

HERE = Path(__file__).parent
MODELS = ['BAAI/bge-m3', 'BAAI/bge-reranker-v2-m3']


def download_models():
    from huggingface_hub import snapshot_download
    for m in MODELS:
        snapshot_download(m, ignore_patterns=['onnx/*', '*.onnx', 'imgs/*'])     # PyTorch weights only


def build_index():
    import sys
    sys.path.insert(0, '/app/pipeline')
    from corpus import load_corpus
    from embedders import load_or_build
    load_or_build('bge-m3', load_corpus())                                       # -> /app/data/index/bge-m3


image = (
    modal.Image.debian_slim(python_version='3.12')
    .uv_pip_install('torch>=2.7', 'sentence-transformers>=5.0', 'transformers>=4.51', 'numpy', 'pandas',
                    'python-dotenv', 'openai>=1.60', 'fastapi[standard]')
    .env({'HF_HOME': '/models', 'HF_HUB_OFFLINE': '0', 'BIDAYAH_CORS': '*'})
    .run_function(download_models)
    .add_local_dir(HERE / 'pipeline', '/app/pipeline', copy=True)
    .add_local_dir(HERE / 'data' / 'chunks', '/app/data/chunks', copy=True)
    .add_local_file(HERE / 'server.py', '/app/server.py', copy=True)
    .run_function(build_index, gpu='T4')
    .env({'HF_HUB_OFFLINE': '1'})                                                # never re-download at runtime
)

app = modal.App('bidayah-api', image=image)


@app.function(
    gpu='T4',
    secrets=[modal.Secret.from_name('bidayah-openai')],
    scaledown_window=300,          # stay warm 5 min after the last request (billed), then scale to zero (free)
    max_containers=1,              # one GPU at most: caps the cost of a public demo link
    timeout=300,
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def serve():
    import os, sys
    os.chdir('/app')
    sys.path.insert(0, '/app')
    import server
    server.load()                  # load corpus + models before the first request is routed
    return server.app
