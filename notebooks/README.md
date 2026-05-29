# Notebooks

## OpenAI usage tracker

```bash
cd /path/to/knight-vision
.venv/bin/pip install -r notebooks/requirements.txt
.venv/bin/jupyter notebook notebooks/openai_usage.ipynb
```

Or in VS Code / Cursor: open `openai_usage.ipynb` and select the project `.venv` kernel.

Requires `OPENAI_API_KEY` in the repo-root `.env`.

The notebook logs **one row per API call**. Chess explanations use **one call per ply** (not one combined plan). Outputs `openai_usage_log.csv` and `openai_responses.csv`.
