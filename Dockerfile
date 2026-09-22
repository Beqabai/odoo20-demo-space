FROM odoobot/odoo:20.0

USER root

RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

# Odoo-ს ვუშვებთ ყოველგვარი წინასწარი ბაზების გარეშე, რომ სტარტზე არ გაიჭედოს
CMD ["odoo", "--http-port=10000", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"]
