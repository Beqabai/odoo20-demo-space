FROM odoobot/odoo:20.0

USER root

RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

ENV PORT=7860
EXPOSE 7860

RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

CMD ["odoo", "--http-port=7860", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"]
