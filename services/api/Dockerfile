# FastAPI service. Pinned dependencies, non-root, no compiler or system packages needed
# (every dependency ships a prebuilt wheel).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --system --create-home app && chown -R app /app
USER app
EXPOSE 8000
# JWT_SECRET (32+ chars) is required and is passed at run time; the app refuses to start without it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
