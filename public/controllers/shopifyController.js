const shopifyApi = require('../helpers/shopifyApi');
const salesOrderModel = require('../models/salesOrderModel');
const common = require('@kelchy/common');
const Error = require('../helpers/error');
const { log } = require('../helpers/logger');
const CryptoJS = require('crypto-js');
const pusherUtil = require('../utils/pusherUtil');
const bundleModel = require('../models/bundleModel');

const addShopifyOrders = async (req, res) => {
  const { last_date, latestId, limit } = req.body;
  try {
    const data = await shopifyApi.getOrders({ last_date, latestId, limit });
    if (data) {
      await Promise.all(
        data.map(async (salesOrder) => {
          const salesOrderDB = await salesOrderModel.findSalesOrderByOrderId({
            orderId: salesOrder.id.toString()
          });
          if (!salesOrderDB) {
            return await salesOrderModel.createSalesOrder({
              orderId: salesOrder.id.toString(),
              customerName:
                salesOrder.customer.first_name + salesOrder.customer.last_name,
              customerAddress:
                salesOrder.customer.default_address.address1 +
                salesOrder.customer.default_address.address2,
              customerContactNo: salesOrder.customer.default_address.phone,
              customerEmail: salesOrder.contact_email,
              postalCode: salesOrder.customer.default_address.zip,
              customerRemarks: salesOrder.note,
              platformType: 'SHOPIFY',
              createdTime: salesOrder.created_at,
              currency: salesOrder.currency,
              amount: salesOrder.current_total_price,
              salesOrderItems: await Promise.all(
                salesOrder.line_items.map(async (item) => {
                  const bundle = await bundleModel.findBundleByName({
                    name: item.name.replace(/ *\[[^\]]*]/g, '')
                  });
                  let salesOrderBundleItems = [];
                  if (bundle) {
                    salesOrderBundleItems = bundle.bundleProduct;
                  }
                  return {
                    productName: item.name.replace(/ *\[[^\]]*]/g, ''),
                    price: item.price,
                    quantity: item.quantity,
                    salesOrderBundleItems
                  };
                })
              )
            });
          }
        })
      );
    }
    log.out('OK_SHOPIFY_GET-SHOPIFY-ORDER');
    res.json(data);
  } catch (error) {
    log.error('ERR_SHOPIFY-ADD-ORDERS', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  }
};

const verifyWebhook = (req) => {
  const { data, hmac_header } = req;
  const key = CryptoJS.enc.Utf8.parse(process.env.SHOPIFY_API_KEY);
  const msg = CryptoJS.enc.Utf8.parse(data);
  const token = CryptoJS.enc.Hex.stringify(CryptoJS.HmacSHA256(msg, key));

  console.log(token === hmac_header);
  return token === hmac_header;
};

const createOrderWebhook = async (req, res, next) => {
  const salesOrder = req.body;

  // const verified = verifyWebhook({
  //   salesOrder,
  //   hmac_header: req.headers['X-Shopify-Hmac-SHA256']
  // });
  try {
    const salesOrderDB = await salesOrderModel.findSalesOrderByOrderId({
      orderId: salesOrder.id.toString()
    });
    if (!salesOrderDB) {
      const salesOrderData = await salesOrderModel.createSalesOrder({
        orderId: salesOrder.id.toString(),
        customerName:
          salesOrder.customer.first_name + salesOrder.customer.last_name,
        customerAddress:
          salesOrder.customer.default_address.address1 +
          (salesOrder.customer.default_address.address2 ??
            ` ${salesOrder.customer.default_address.zip}`),
        customerContactNo: salesOrder.customer.default_address.phone,
        customerEmail: salesOrder.contact_email,
        postalCode: salesOrder.customer.default_address.zip,
        customerRemarks: salesOrder.note,
        platformType: 'SHOPIFY',
        createdTime: salesOrder.created_at,
        currency: salesOrder.currency,
        amount: salesOrder.total_line_items_price,
        salesOrderItems: await Promise.all(
          salesOrder.line_items.map(async (item) => {
            const bundle = await bundleModel.findBundleByName({
              name: item.name.replace(/ *\[[^\]]*]/g, '')
            });
            let salesOrderBundleItems = [];
            if (bundle) {
              salesOrderBundleItems = bundle.bundleProduct;
            }
            return {
              productName: item.name.replace(/ *\[[^\]]*]/g, ''),
              price: item.price,
              quantity: item.quantity,
              salesOrderBundleItems
            };
          })
        )
      });
      log.out('OK_SHOPIFY_ADD-ORDER-WEBHOOK');
      res.json({ message: 'order received' });
      pusherUtil.sendPusherMsg(salesOrderData);
    } else {
      res.json({ message: 'order already exists' });
    }
  } catch (error) {
    log.error('ERR_SHOPIFY_ADD-ORDER-WEBHOOK', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  }
};

exports.addShopifyOrders = addShopifyOrders;
exports.createOrderWebhook = createOrderWebhook;
