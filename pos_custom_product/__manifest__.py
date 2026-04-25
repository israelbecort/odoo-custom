{
    "name": "POS Custom Product",
    "version": "19.0.1.0.0",
    "summary": "Popup for custom product in POS",
    "depends": ["point_of_sale"],
    "data": ["security/ir.model.access.csv",
            "views/pos_margin_report_views.xml"],
    "assets": {
        "point_of_sale._assets_pos": [
        "pos_custom_product/static/src/js/pos_create_product.js",
        "pos_custom_product/static/src/xml/pos_create_product_popup.xml",
        "pos_custom_product/static/src/js/pos_custom_product.js",
        "pos_custom_product/static/src/xml/pos_custom_product_popup.xml",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}