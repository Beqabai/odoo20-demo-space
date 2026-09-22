FROM odoobot/odoo:20.0

USER root
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons
RUN chown -R odoo:odoo /mnt/extra-addons
USER odoo

# Odoo-ს პირდაპირ ვუშვებთ Supabase-ის ბაზის პარამეტრებით
CMD ["odoo", "--http-port=10000", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons", "--db_host=db.hyfcefsvjnmuxofmwfv.supabase.co", "--db_user=postgres", "--db_password=თქვენი_supabase_პაროლი", "--db_port=5432"]
