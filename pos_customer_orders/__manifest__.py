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
    "assets": {
        "point_of_sale._assets_pos": [
            "pos_customer_orders/static/src/js/pos_customer_orders.js",
            "pos_customer_orders/static/src/xml/pos_customer_orders.xml",
            "pos_customer_orders/static/src/xml/pos_customer_orders_receipt.xml",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}