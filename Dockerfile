FROM odoobot/odoo:20.0

USER root

# ვქმნით საქაღალდეს და გადაგვაქვს მოდულები
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# ვანიჭებთ Odoo მომხმარებელს წვდომის უფლებას
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

# ვუშვებთ odoo ბრძანებით პირდაპირ მითითებულ პორტზე
CMD ["odoo", "--http-port=10000", "--addons-path=/mnt/extra-addons"]
