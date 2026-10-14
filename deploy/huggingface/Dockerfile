# Quantix on Hugging Face Spaces (Docker SDK, free CPU). Built from the folder that tools/make_deploy.py creates.
# Same Python and package versions as the tested local setup (requirements.lock.txt), CPU-only PyTorch.
FROM python:3.14-slim

# OpenCV needs these system libraries even without a screen
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Spaces run the container as user 1000; give it a home and a writable app folder
RUN useradd -m -u 1000 user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MPLCONFIGDIR=/tmp/matplotlib YOLO_CONFIG_DIR=/tmp/ultralytics \
    IAV_PUBLIC=1
WORKDIR /app

COPY --chown=user requirements-deploy.txt .
RUN pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements-deploy.txt

COPY --chown=user . .
RUN mkdir -p outputs && chown -R user:user /app
USER user

EXPOSE 7860
# --proxy-headers: rate limits see each visitor's real address, not the Spaces proxy
CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
