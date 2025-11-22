FROM telegraf:1.30

# Instalar Python y psycopg2
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    libpq-dev \
    gcc \
    python3-dev && \
    pip3 install --break-system-packages --no-cache-dir psycopg2-binary && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copiar el script de PostgreSQL
COPY postgres_writer.py /etc/telegraf/postgres_writer.py
RUN chmod +x /etc/telegraf/postgres_writer.py

