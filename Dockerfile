FROM python:3.12-slim-bookworm

# სისტემური ბიბლიოთეკები
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

# Odoo 20.0-ის კლონირება
RUN git clone --depth 1 --branch 20.0 https://github.com/odoo/odoo.git /opt/odoo

# postgres იუზერის უსაფრთხოების ბლოკის გათიშვა
RUN sed -i "s/if db_user == 'postgres':/if False:/g" /opt/odoo/odoo/tools/config.py || true

# პითონის დამოკიდებულებები
WORKDIR /opt/odoo
RUN pip install --no-cache-dir -r requirements.txt

# ადსონების საქაღალდე
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# მომხმარებელი
RUN useradd -m -d /opt/odoo -s /bin/bash odoo \
    && chown -R odoo:odoo /opt/odoo /mnt/extra-addons

USER odoo

# გაშვება log-level=debug-ით (რომ ზუსტი მიზეზი გამოჩნდეს)
CMD ["sh", "-c", "python3 /opt/odoo/odoo-bin --http-port=10000 --log-level=debug --db_host=db.hyfcefsvjnjmuxofmwfv.supabase.co --db_port=5432 --db_user=postgres --db_password=$PASSWORD -d postgres --addons-path=/opt/odoo/addons,/mnt/extra-addons"]
