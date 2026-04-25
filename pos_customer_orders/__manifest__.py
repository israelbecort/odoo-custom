{
    "name": "POS Customer Orders",
    "version": "1.0",
    "summary": "Encargos con anticipo desde TPV",
    "author": "Tu",
    "depends": ["point_of_sale"],
    "data": [
        "security/ir.model.access.csv",
        "data/sequence.xml",
        "views/pos_customer_order_views.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}