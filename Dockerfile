FROM python:3.12-slim-bookworm

# სისტემური დამოკიდებულებების და Git-ის ინსტალაცია
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

# ოფიციალური Odoo-ს კლონირება პირდაპირ 20.0 ბრენჩიდან
RUN git clone --depth 1 --branch 20.0 https://github.com/odoo/odoo.git /opt/odoo

# Odoo-ს პითონის პაკეტების ინსტალაცია
WORKDIR /opt/odoo
RUN pip install --no-cache-dir -r requirements.txt

# თქვენი მოდულების საქაღალდის შექმნა და კოდის გადმოტანა
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# სისტემური მომხმარებელი უსაფრთხოებისთვის
RUN useradd -m -d /opt/odoo -s /bin/bash odoo \
    && chown -R odoo:odoo /opt/odoo /mnt/extra-addons

USER odoo

# გაშვება ოფიციალური odoo-bin ფაილით და თქვენი მოდულების მიბმით
CMD ["python3", "/opt/odoo/odoo-bin", "--http-port=10000", "--addons-path=/opt/odoo/addons,/mnt/extra-addons"]
