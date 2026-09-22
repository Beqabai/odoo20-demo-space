FROM python:3.12-slim-bookworm

# სისტემური ბიბლიოთეკების დამოკიდებულებები
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
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

# Odoo 20.0-ის სუფთა კლონირება
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

USER odoo

# გაშვება Odoo_20 ბაზის ინიციალიზაციით
CMD ["sh", "-c", "python3 /opt/odoo/odoo-bin --http-interface=0.0.0.0 --http-port=10000 --db_host=aws-0-ap-southeast-2.pooler.supabase.com --db_port=5432 --db_user=odoouser.hyfcefsvjnjmuxofmwfv --db_password=odoo12345password -d Odoo_20 -i base --addons-path=/opt/odoo/addons,/mnt/extra-addons"]
