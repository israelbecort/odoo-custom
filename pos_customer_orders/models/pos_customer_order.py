from odoo import models, fields, api
from odoo.exceptions import UserError


class PosCustomerOrder(models.Model):
    _name = "pos.customer.order"
    _description = "Encargos TPV"

    name = fields.Char(string="Referencia", default="Nuevo", required=True)

    partner_id = fields.Many2one("res.partner", string="Cliente")
    note = fields.Text(string="Descripción")

    total_amount = fields.Float(string="Total")
    paid_amount = fields.Float(string="Pagado")

    pending_amount = fields.Float(
        string="Pendiente",
        compute="_compute_pending",
        store=True,
    )

    state = fields.Selection(
        [
            ("draft", "Pendiente"),
            ("done", "Entregado"),
        ],
        default="draft",
    )

    @api.depends("total_amount", "paid_amount")
    def _compute_pending(self):
        for rec in self:
            rec.pending_amount = rec.total_amount - rec.paid_amount

    @api.model
    def create_from_pos(self, data):
        partner_name = data.get("partner_name")
        phone = data.get("phone")
        note = data.get("note")
        total_amount = float(data.get("total_amount") or 0)
        paid_amount = float(data.get("paid_amount") or 0)

        partner = False
        if partner_name or phone:
            domain = []
            if phone:
                domain = ["|", ("phone", "=", phone), ("mobile", "=", phone)]
            elif partner_name:
                domain = [("name", "ilike", partner_name)]

            partner = self.env["res.partner"].search(domain, limit=1)

            if not partner:
                partner = self.env["res.partner"].create({
                    "name": partner_name or phone,
                    "phone": phone,
                })

        order = self.create({
            "partner_id": partner.id if partner else False,
            "note": note,
            "total_amount": total_amount,
            "paid_amount": paid_amount,
        })

        product = self.env["product.product"].search([
            ("default_code", "=", "ANTICIPO")
        ], limit=1)

        if not product:
            raise UserError("No existe el producto con referencia ANTICIPO.")

        return {
            "id": order.id,
            "name": order.name,
            "pending_amount": order.pending_amount,
            "product_id": product.id,
        }