FROM python:3.12-slim-bookworm

# ლოგების მომენტალური გამოტანა Render-ის ეკრანზე
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# სისტემური ბიბლიოთეკები, Git და ლოკალური PostgreSQL
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

# ლოკალური ბაზის გაშვებისა და Odoo-ს ინიციალიზაციის გამშვები სკრიპტი
RUN echo '#!/bin/bash\n\
service postgresql start\n\
su - postgres -c "createuser -s odoo 2>/dev/null || true"\n\
su - postgres -c "createdb -O odoo odoo_db 2>/dev/null || true"\n\
exec su - odoo -c "python3 /opt/odoo/odoo-bin --http-interface=0.0.0.0 --http-port=10000 -d odoo_db -i base --addons-path=/opt/odoo/addons,/mnt/extra-addons"\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 10000

CMD ["/entrypoint.sh"]
