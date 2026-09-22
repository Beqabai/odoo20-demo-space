FROM odoobot/odoo:20.0

USER root

RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

# კოდიდან ამოღებულია პაროლი, მას Render-ი თავად მიაწვდის უსაფრთხოდ
CMD ["odoo", "--http-port=10000", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons", "--db_host=db.hyfcefsvjnmuxofmwfv.supabase.co", "--db_user=postgres", "--db_port=5432"]
