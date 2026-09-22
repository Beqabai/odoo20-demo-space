FROM odoobot/odoo:19.4

USER root

# ვქმნით საქაღალდეს და შიგ გადაგვაქვს თქვენი მოდულები
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# ვანიჭებთ Odoo მომხმარებელს ფაილებზე წვდომის უფლებას
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

# ვუშვებთ Odoo 19.4-ს Render-ის პორტზე (10000) და ავტომატურად ვაკავშირებთ Supabase-ს
CMD ["python3", "/usr/bin/odoo", "--http-port=10000", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons", "--db_host=db.hyfcefsvjnmuxofmwfv.supabase.co", "--db_user=postgres", "--db_port=5432"]
