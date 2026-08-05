# Evaluation harness

`run_eval.py` scores retrieval quality against a fixed query set and writes a markdown report.

```bash
python3 run_eval.py --output results-$(date +%Y%m%d).md
```

`queries.yaml` holds the query set: each entry lists the expected source collections and the
keywords a good answer should contain. Metrics reported are recall@k and keyword-match rate,
averaged over the set.

## Why there are no result files here

The reports referenced from the ADRs (`results-20260511-reranker.md`,
`results-20260411-pgvector.md`, and the monthly runs) are **not published**: every row quotes a
top-1 snippet from the author's real memory — private conversations, task history, personal
finance and health chatter. Publishing the numbers would mean publishing the corpus.

The headline figure they record is **recall@5 = 83.3%** after the cross-encoder reranker was
added, against 82% for the previous ChromaDB + reranker setup. Methodology and the decisions
behind those numbers are in `docs/adr/mempalace-reranker.md` and
`docs/adr/mempalace-pgvector.md`.

Generate your own baseline once your palace has content — with a different corpus the absolute
numbers will differ, and only the trend across your own runs is meaningful.
