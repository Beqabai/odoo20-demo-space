FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# სისტემური ბიბლიოთეკები და PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    postgresql \
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

# Python პაკეტების ინსტალაცია
WORKDIR /opt/odoo
RUN pip install --no-cache-dir -r requirements.txt

# ადსონების საქაღალდე
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# სისტემური მომხმარებელი
RUN useradd -m -d /opt/odoo -s /bin/bash odoo \
    && chown -R odoo:odoo /opt/odoo /mnt/extra-addons

# ჭკვიანი გამშვები სკრიპტი: ავტომატური ინიციალიზაცია მხოლოდ საჭიროებისას
RUN echo '#!/bin/bash\n\
sed -i "s/shared_buffers = .*/shared_buffers = 32MB/" /etc/postgresql/*/main/postgresql.conf\n\
sed -i "s/work_mem = .*/work_mem = 4MB/" /etc/postgresql/*/main/postgresql.conf\n\
sed -i "s/max_connections = .*/max_connections = 20/" /etc/postgresql/*/main/postgresql.conf\n\
\n\
service postgresql start\n\
su - postgres -c "createuser -s odoo 2>/dev/null || true"\n\
su - postgres -c "createdb -O odoo odoo_db 2>/dev/null || true"\n\
\n\
# ვამოწმებთ, არსებობს თუ არა უკვე ir_module_module ცხრილი\n\
TABLE_EXISTS=$(su - postgres -c "psql -d odoo_db -tAc \"SELECT 1 FROM information_schema.tables WHERE table_name = '\''ir_module_module'\'';\"")\n\
\n\
if [ "$TABLE_EXISTS" != "1" ]; then\n\
    echo "=== Initializing database odoo_db with base module ==="\n\
    su - odoo -c "python3 /opt/odoo/odoo-bin --workers=0 --max-cron-threads=0 -d odoo_db -i base --stop-after-init --addons-path=/opt/odoo/addons,/mnt/extra-addons"\n\
fi\n\
\n\
echo "=== Starting Odoo Web Server ==="\n\
exec su - odoo -c "python3 /opt/odoo/odoo-bin --http-interface=0.0.0.0 --http-port=10000 --workers=0 --max-cron-threads=1 -d odoo_db --addons-path=/opt/odoo/addons,/mnt/extra-addons"\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 10000

CMD ["/entrypoint.sh"]
