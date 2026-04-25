from odoo import models, fields, api


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
    def create(self, vals):
        if vals.get("name", "Nuevo") == "Nuevo":
            vals["name"] = (
                self.env["ir.sequence"].next_by_code("pos.customer.order")
                or "ENC/0001"
            )
        return super().create(vals)