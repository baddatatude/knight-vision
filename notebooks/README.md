# Notebooks

## OpenAI usage

Queries **real account usage** from OpenAI's Organization Costs / Usage API (last 30 days by default).

```bash
cd /path/to/knight-vision
.venv/bin/pip install -r notebooks/requirements.txt
.venv/bin/jupyter notebook notebooks/openai_usage.ipynb
```

**Requires `OPENAI_ADMIN_KEY`** in repo-root `.env` — an [organization admin key](https://platform.openai.com/settings/organization/admin-keys) with `api.usage.read`. Your regular `OPENAI_API_KEY` cannot call these endpoints.

Without an admin key, use the [OpenAI usage dashboard](https://platform.openai.com/usage).

Or in VS Code / Cursor: open `openai_usage.ipynb` and select the project `.venv` kernel.
