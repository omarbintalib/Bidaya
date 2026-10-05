# Bidayah RAG backend (CPU). Build from the REPO ROOT so the data package CSVs are included:
#   docker build -f backend/Dockerfile -t bidayah-api .
#   docker run -p 8000:8000 --env-file backend/.env bidayah-api
# First start downloads bge-m3 + bge-reranker-v2-m3 (~4.5 GB) and embeds the corpus (several minutes on CPU);
# mount a volume on /root/.cache/huggingface and /app/backend/data/index to keep them between runs.
FROM python:3.13-slim
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY *.csv *.geojson ./
COPY backend backend
WORKDIR /app/backend
ENV BIDAYAH_CORS=*
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
