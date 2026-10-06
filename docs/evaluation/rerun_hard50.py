"""Re-ask the 50 hard questions against the live assistant, several times, and measure how stable the answers are.

    python3 docs/evaluation/rerun_hard50.py              # 2 runs against the live site's backend
    python3 docs/evaluation/rerun_hard50.py --runs 3 --api http://127.0.0.1:8000/api/ask

Writes rerun-<date>.json (every answer of every run) and prints, for each pair of runs, how many questions got the same
outcome (answered / declined / referred), the same event on the map, and the same or overlapping sources. Follow-up
questions are asked inside a conversation: their first question, then the follow-up with that answer as history.
Standard library only.
"""
import argparse, datetime, json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
LIVE = 'https://hassan999yjy--bidayah-api-serve.modal.run/api/ask'


def ask(api, question, locale, history=None):
    body = {'question': question, 'locale': locale, **({'history': history} if history else {})}
    started = time.time()
    try:
        req = urllib.request.Request(api, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        reply = json.loads(urllib.request.urlopen(req, timeout=170).read())
    except Exception as e:                       # noqa: BLE001 - record the failure and go on
        reply = {'status': 'error', 'error': str(e)}
    reply['seconds'] = round(time.time() - started, 1)
    return reply


def one(api, item):
    if 'first' in item:
        first = ask(api, item['first'], item['locale'])
        reply = ask(api, item['question'], item['locale'], [{'question': item['first'], 'answer': first.get('text', '')}])
        reply['first'] = {'question': item['first'], 'text': first.get('text'), 'status': first.get('status')}
    else:
        reply = ask(api, item['question'], item['locale'])
    return {**{k: item[k] for k in ('n', 'locale', 'question', 'group')}, **reply}


def compare(a, b):
    same_status = same_event = same_sources = shared_source = 0
    for x, y in zip(a, b):
        same_status += x.get('status') == y.get('status')
        same_event += x.get('event') == y.get('event')
        sx, sy = {s['url'] for s in x.get('sources', [])}, {s['url'] for s in y.get('sources', [])}
        same_sources += sx == sy
        shared_source += bool(sx & sy) or (not sx and not sy)
    return dict(questions=len(a), same_outcome=same_status, same_map_event=same_event,
                identical_sources=same_sources, at_least_one_shared_source=shared_source)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=2)
    ap.add_argument('--api', default=LIVE)
    args = ap.parse_args()
    items = json.load(open(os.path.join(HERE, 'hard-50-questions.json'), encoding='utf-8'))
    runs = []
    for r in range(args.runs):
        with ThreadPoolExecutor(6) as ex:
            runs.append(sorted(ex.map(lambda it: one(args.api, it), items), key=lambda x: x['n']))
        print(f'run {r + 1}: done')
    pairs = [dict(runs=[i + 1, j + 1], **compare(runs[i], runs[j])) for i in range(len(runs)) for j in range(i + 1, len(runs))]
    for p in pairs:
        print(json.dumps(p))
    out = os.path.join(HERE, f'rerun-{datetime.date.today()}.json')
    json.dump({'api': args.api, 'pairs': pairs, 'runs': runs}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', out)
