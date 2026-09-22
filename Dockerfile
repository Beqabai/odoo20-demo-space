FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# სისტემური ბიბლიოთეკები და კლიენტი
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    postgresql-client \
    build-essential \
    libldap2-dev \
    libsasl2-dev \
    libpq-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    node-less \
    wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/*

# Odoo 20.0-ის კლონირება
RUN git clone --depth 1 --branch 20.0 https://github.com/odoo/odoo.git /opt/odoo

# Odoo-ს კოდიდან postgres მომხმარებლის ხელოვნური შეზღუდვის მოხსნა
RUN sed -i "s/if self\['db_user'\] == 'postgres':/if False:/g" /opt/odoo/odoo/tools/config.py

# Python პაკეტების ინსტალაცია
WORKDIR /opt/odoo
RUN pip install --no-cache-dir -r requirements.txt

# ადსონების საქაღალდე
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# სისტემური მომხმარებელი
RUN useradd -m -d /opt/odoo -s /bin/bash odoo \
    && chown -R odoo:odoo /opt/odoo /mnt/extra-addons

# გამშვები სკრიპტი
RUN echo '#!/bin/bash\n\
echo "=== Checking Supabase Database State ==="\n\
TABLE_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name = '\''ir_module_module'\'';" 2>/dev/null || true)\n\
\n\
if [ "$TABLE_EXISTS" != "1" ]; then\n\
    echo "=== Initializing database in Supabase for the first time (-i base) ==="\n\
    python3 /opt/odoo/odoo-bin --workers=0 --max-cron-threads=0 --db_host="$DB_HOST" --db_port="$DB_PORT" --db_user="$DB_USER" --db_password="$DB_PASSWORD" -d "$DB_NAME" -i base --stop-after-init --addons-path=/opt/odoo/addons,/mnt/extra-addons\n\
fi\n\
\n\
echo "=== Starting Odoo Web Server ==="\n\
exec python3 /opt/odoo/odoo-bin --http-interface=0.0.0.0 --http-port=10000 --workers=0 --max-cron-threads=1 --db_host="$DB_HOST" --db_port="$DB_PORT" --db_user="$DB_USER" --db_password="$DB_PASSWORD" -d "$DB_NAME" --addons-path=/opt/odoo/addons,/mnt/extra-addons\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

USER odoo

EXPOSE 10000

CMD ["/entrypoint.sh"]
