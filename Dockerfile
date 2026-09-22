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

# Odoo 20.0-ის კლონირება
RUN git clone --depth 1 --branch 20.0 https://github.com/odoo/odoo.git /opt/odoo

# postgres მომხმარებლის უსაფრთხოების შემოწმების სრული განეიტრალება
RUN python3 -c "
import os
for root, _, files in os.walk('/opt/odoo'):
    for f in files:
        if f.endswith('.py'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
            if 'is a security risk, aborting' in content:
                content = content.replace('sys.exit(1)', 'pass')
                content = content.replace('sys.exit(2)', 'pass')
                with open(p, 'w', encoding='utf-8') as file:
                    file.write(content)
"

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

# გაშვება Supabase-ის postgres მომხმარებლით და 10000 პორტზე
CMD ["sh", "-c", "python3 /opt/odoo/odoo-bin --http-port=10000 --db_host=db.hyfcefsvjnjmuxofmwfv.supabase.co --db_port=5432 --db_user=postgres --db_password=$PASSWORD -d postgres --addons-path=/opt/odoo/addons,/mnt/extra-addons"]
