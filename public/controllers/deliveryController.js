const deliveryModel = require('../models/deliveryModel');
const salesOrderModel = require('../models/salesOrderModel');
const userModel = require('../models/userModel');
const common = require('@kelchy/common');
const Error = require('../helpers/error');
const { log } = require('../helpers/logger');
const {
  ShippingType,
  DeliveryMode,
  OrderStatus,
  PrismaClient
} = require('@prisma/client');
const shippitApi = require('../helpers/shippitApi');
const axios = require('axios');
const { generateDeliveryOrderPdfTemplate } = require('../helpers/pdf');
const { format } = require('date-fns');
const prisma = new PrismaClient();

const createManualDeliveryOrder = async (req, res) => {
  const {
    shippingType,
    shippingDate,
    deliveryDate,
    carrier,
    comments,
    eta,
    salesOrderId,
    assignedUserId
  } = req.body;
  let salesOrder = await salesOrderModel.findSalesOrderById({
    id: salesOrderId
  });
  let assignedUser = {};
  if (assignedUserId !== undefined) {
    assignedUser = await userModel.findUserById({ id: assignedUserId });
  }
  const { data, error } = await common.awaitWrap(
    deliveryModel.createDeliveryOrder({
      shippingType,
      shippingDate,
      deliveryDate,
      comments,
      eta,
      shippitTrackingNum: null,
      carrier,
      salesOrderId,
      assignedUserId
    })
  );
  await salesOrderModel.updateSalesOrderStatus({
    id: salesOrder.id,
    orderStatus: OrderStatus.READY_FOR_DELIVERY
  });
  if (error) {
    log.error('ERR_DELIVERYORDER_CREATE-MANUAL-DO', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    log.out('OK_DELIVERYORDER_CREATE-MANUAL-DO');
    const result = {
      id: data.id,
      shippingType,
      shippingDate,
      deliveryDate,
      eta,
      comments,
      carrier,
      orderStatus: OrderStatus.READY_FOR_DELIVERY,
      salesOrder,
      assignedUser
    };
    res.json(result);
  }
};

const createShippitDeliveryOrder = async (req, res) => {
  const {
    shippingType,
    courierType,
    shippingDate,
    deliveryDate,
    deliveryMode,
    carrier,
    comments,
    eta,
    parcelQty,
    parcelWeight,
    salesOrderId
  } = req.body;
  let salesOrder = await salesOrderModel.findSalesOrderById({
    id: salesOrderId
  });
  const soShippit = await deliveryModel.sendDeliveryOrderToShippit({
    courier_type: courierType,
    delivery_address: salesOrder.customerAddress,
    delivery_postcode: salesOrder.postalCode,
    delivery_state: 'Singapore',
    delivery_suburb: 'SG',
    courier_allocation: carrier,
    parcelQty,
    parcelWeight,
    email:
      salesOrder.customerEmail === null
        ? 'zac@thekettlegourmet.com'
        : salesOrder.customerEmail,
    first_name: salesOrder.customerName.split(' ')[0],
    last_name:
      salesOrder.customerName.split(' ')[1] === ''
        ? ''
        : salesOrder.customerName.split(' ')[1]
  });
  log.out('OK_DELIVERYORDER_CREATE-DO-SHIPPIT');
  const { data, error } = await common.awaitWrap(
    deliveryModel.createDeliveryOrder({
      shippingType,
      shippingDate,
      deliveryDate,
      comments,
      eta,
      shippitTrackingNum: soShippit.response.tracking_number,
      deliveryMode,
      carrier,
      salesOrderId
    })
  );
  if (error) {
    log.error('ERR_DELIVERYORDER_CREATE-DO', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    await salesOrderModel.updateSalesOrderStatus({
      id: salesOrder.id,
      orderStatus: OrderStatus.READY_FOR_DELIVERY
    });
    try {
      await deliveryModel.updateShippitStatus({
        status: 'order_placed',
        statusOwner: '',
        date: new Date(Date.now()).toDateString(),
        timestamp: new Date(Date.now()).toTimeString(),
        deliveryOrderId: data.id
      });
      const result = {
        id: data.id,
        shippingType,
        shippingDate,
        deliveryDate,
        deliveryMode,
        eta,
        comments,
        carrier,
        orderStatus: OrderStatus.READY_FOR_DELIVERY,
        trackingNumber: data.shippitTrackingNum,
        salesOrder,
        deliveryStatus: {
          status: 'order_placed',
          statusOwner: '',
          date: new Date(Date.now()).toDateString(),
          timestamp: new Date(Date.now()).toTimeString(),
          deliveryOrderId: data.id
        }
      };
      res.json(result);
      log.out('OK_DELIVERYORDER_CREATE-DO');
    } catch (error) {
      const e = Error.http(error);
      res.status(e.code).json(e.message);
    }
  }
};

const getAllDeliveryOrders = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.getAllDeliveryOrders({})
  );

  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-DO');
    res.json(data);
  }
};

const getAllManualDeliveryOrders = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.getAllManualDeliveryOrders({})
  );

  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-MANUAL-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-MANUAL-DO');
    res.json(data);
  }
};

const getAllShippitDeliveryOrders = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.getAllShippitDeliveryOrders({})
  );

  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-SHIPPIT-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-SHIPPIT-DO');
    res.json(data);
  }
};

const getAllGrabDeliveryOrders = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.getAllGrabDeliveryOrders({})
  );

  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-GRAB-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-GRAB-DO');
    res.json(data);
  }
};

const getDeliveryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveryOrder = await deliveryModel.findDeliveryOrderById({ id });
    log.out('OK_DELIVERY_GET-DO-BY-ID');
    res.json(deliveryOrder);
  } catch (error) {
    log.error('ERR_DELIVERY_GET-DO', error.message);
    res.status(500).send('Server Error');
  }
};

const getDeliveryOrderByTrackingNumber = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    await deliveryModel.fetchLatestStatusFromShippitAndAddToStatus({
      trackingNum: trackingNumber
    });
    const deliveryOrder = await deliveryModel.findDeliveryOrderByTrackingNumber(
      { trackingNumber }
    );
    const result = {
      ...deliveryOrder,
      deliveryStatus:
        deliveryOrder.deliveryStatus[deliveryOrder.deliveryStatus.length - 1]
    };
    log.out('OK_DELIVERY_GET-DO-BY-TRACKING-NUMBER');
    res.json(result);
  } catch (error) {
    log.error('ERR_DELIVERY_GET-DO-BY-TRACKING-NUMBER', error.message);
    res.status(500).send('Server Error');
  }
};

const getDeliveryOrderBySalesOrderId = async (req, res) => {
  try {
    const { salesOrderId } = req.params;
    const deliveryOrder = await deliveryModel.findDeliveryOrderBySalesOrderId({
      salesOrderId
    });
    const result = {
      ...deliveryOrder,
      deliveryStatus:
        deliveryOrder.deliveryStatus[deliveryOrder.deliveryStatus.length - 1]
    };
    log.out('OK_DELIVERY_GET-DO-BY-SO-ID');
    res.json(result);
  } catch (error) {
    log.error('ERR_DELIVERY_GET-DO-BY-SO-ID', error.message);
    res.status(500).send('Server Error');
  }
};

const findDeliveriesWithTimeAndTypeFilter = async (req, res) => {
  const { time_from, time_to, shippingType } = req.body;
  const { data, error } = await common.awaitWrap(
    deliveryModel.findDeliveriesWithTimeAndTypeFilter({
      time_from: new Date(time_from),
      time_to: new Date(time_to),
      shippingType
    })
  );
  let result = [];
  for (let d of data) {
    const salesOrder = await salesOrderModel.findSalesOrderById({
      id: d.salesOrderId
    });
    let assignedUser = {};
    if (d.assignedUserId !== null) {
      assignedUser = await userModel.findUserById({ id: d.assignedUserId });
    }
    const res = {
      id: d.id,
      shippingType: d.shippingType,
      shippingDate: d.shippingDate,
      deliveryDate: d.deliveryDate,
      deliveryMode: d.deliveryMode,
      comments: d.comments,
      eta: d.eta,
      carrier: d.carrier,
      salesOrder,
      assignedUser
    };
    result.push(res);
  }
  if (error) {
    log.error('ERR_DELIVERY_GET-DELIVERIES-TIME-TYPE-FILTER', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY-DELIVERIES-TIME-TYPE-FILTER');
    res.json(result);
  }
};

const updateDeliveryOrder = async (req, res) => {
  const {
    id,
    shippingType,
    shippingDate,
    deliveryDate,
    deliveryMode,
    carrier,
    comments,
    eta,
    salesOrderId,
    assignedUserId,
    orderStatus
  } = req.body;
  const salesOrder = await salesOrderModel.findSalesOrderById({
    id: salesOrderId
  });
  let assignedUser = {};
  if (assignedUserId !== undefined) {
    assignedUser = await userModel.findUserById({ id: assignedUserId });
  }
  await salesOrderModel.updateSalesOrderStatus({
    id: salesOrderId,
    orderStatus
  });
  const { data, error } = await common.awaitWrap(
    deliveryModel.updateDeliveryOrder({
      id,
      shippingType,
      shippingDate,
      deliveryDate,
      deliveryMode,
      carrier,
      comments,
      eta,
      assignedUserId
    })
  );
  if (error) {
    log.error('ERR_DELIVERY_UPDATE-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_UPDATE-DO');
    const result = {
      id: data.id,
      shippingType,
      shippingDate,
      deliveryMode,
      comments,
      eta,
      orderStatus,
      carrier,
      salesOrder,
      assignedUser
    };
    res.json(result);
  }
};

const deleteDeliveryOrder = async (req, res) => {
  const { id } = req.params;
  const { error } = await common.awaitWrap(
    deliveryModel.deleteDeliveryOrder({ id })
  );
  if (error) {
    log.error('ERR_DELIVERY_DELETE-DO', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_DELETE-DO');
    res.json({ message: `Deleted DeliveryOrder with id:${id}` });
  }
};

const cancelShippitOrder = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const deliveryOrder = await deliveryModel.findDeliveryOrderByTrackingNumber(
      {
        trackingNumber
      }
    );
    await deliveryModel.cancelShippitOrder({ trackingNumber });
    deliveryModel.updateShippitStatus({
      status: 'cancelled',
      statusOwner: '',
      date: new Date(Date.now()).toDateString(),
      timestamp: new Date(Date.now()).toTimeString(),
      deliveryOrderId: deliveryOrder.id
    });
    await salesOrderModel.updateSalesOrderStatus({
      id: deliveryOrder.salesOrderId,
      orderStatus: OrderStatus.CANCELLED
    });
    log.out('OK_DELIVERY_CANCEL-SHIPPIT-ORDER');
    res.json({
      message: `Cancelled Shippit DeliveryOrder with tracking number:${trackingNumber}`
    });
  } catch (error) {
    log.error('ERR_DELIVERY_CANCEL-SHIPPIT-ORDER', error.message);
    res.status(500).send('Server Error');
  }
};

const sendDeliveryOrderToShippit = async (req, res) => {
  const {
    courierType,
    deliveryAddress,
    deliveryPostcode,
    deliveryState,
    deliverySuburb,
    courierAllocation,
    parcelQty,
    parcelWeight,
    recipientEmail,
    firstName,
    lastName
  } = req.body;
  const { data, error } = await common.awaitWrap(
    deliveryModel.sendDeliveryOrderToShippit({
      courier_type: courierType,
      delivery_address: deliveryAddress,
      delivery_postcode: deliveryPostcode,
      delivery_state: deliveryState,
      delivery_suburb: deliverySuburb,
      courier_allocation: courierAllocation,
      qty: parcelQty,
      weight: parcelWeight,
      email: recipientEmail,
      first_name: firstName,
      last_name: lastName
    })
  );
  if (error) {
    log.error('ERR_DELIVERY_SEND-DO-TO-SHIPPIT', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_SEND-DO-TO-SHIPPIT');
    res.json(data.response);
  }
};

const trackShippitOrder = async (req, res) => {
  try {
    const { trackingNum } = req.params;
    const shippitOrder = await deliveryModel.trackShippitOrder({ trackingNum });
    log.out('OK_DELIVERY_TRACK-SHIPPIT-DO');
    res.json(shippitOrder);
  } catch (error) {
    log.error('ERR_DELIVERY_TRACK-SHIPPIT-DO', error.message);
    res.status(500).send('Server Error');
  }
};

const getLastestTrackingInfoOfOrder = async (req, res) => {
  try {
    const { trackingNum } = req.params;
    const shippitOrder = await deliveryModel.trackShippitOrder({ trackingNum });
    log.out('OK_DELIVERY_TRACK-SHIPPIT-DO');
    res.json(shippitOrder.track[0]);
  } catch (error) {
    log.error('ERR_DELIVERY_TRACK-SHIPPIT-DO', error.message);
    res.status(500).send('Server Error');
  }
};

const getAllShippitOrdersFromWebsite = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.getAllDeliveryOrdersFromShippit({})
  );
  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-DO', error.message);
    res.json(Error.http(error));
  } else {
    let dataRes = [];
    for (let d of data) {
      const result = {
        shippitTrackingNum: d.trackingNumber,
        deliveryDate: d.scheduledDeliveryDate,
        comments: d.description,
        eta: d.estimatedDeliveryDatetime,
        deliveryMode:
          d.serviceLevel === 'standard'
            ? DeliveryMode.STANDARD
            : DeliveryMode.EXPRESS,
        shippingDate: d.scheduledDeliveryDate,
        shippingType: ShippingType.SHIPPIT,
        recipient: d.recipient,
        deliveryAddress: d.deliveryAddress
      };
      dataRes.push(result);
    }
    log.out('OK_DELIVERY_GET-ALL-DO');
    res.json(dataRes);
  }
};

const getToken = async (req, res) => {
  const { data, error } = await common.awaitWrap(shippitApi.getToken({}));
  if (error) {
    log.error('ERR_DELIVERY_GET-TOKEN', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-TOKEN');
    res.json({ token: data });
  }
};

// const confirmShippitOrder = async (req, res) => {
//   try {
//     const { trackingNumber } = req.params;
//     const deliveryOrder = await deliveryModel.findDeliveryOrderByShippitTrackingNum({ trackingNumber });
//     await deliveryModel.confirmShippitOrder({ trackingNumber });
//     await salesOrderModel.updateSalesOrderStatus({ id: deliveryOrder.salesOrderId, orderStatus: OrderStatus.SHIPPED });
//     log.out('OK_DELIVERY_CONFIRM-SHIPPIT-ORDER');
//     res.json({ message: `Confirmed Shippit DeliveryOrder with tracking number:${trackingNumber}` });
//   } catch (error) {
//     log.error('ERR_DELIVERY_CONFIRM-SHIPPIT-ORDER', error.message);
//     res.json(Error.http(error));
//   }
// };

const confirmShippitOrder = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const deliveryOrder = await deliveryModel.findDeliveryOrderByTrackingNumber(
      { trackingNumber }
    );
    await deliveryModel.confirmShippitOrder({ trackingNumber });
    await salesOrderModel.updateSalesOrderStatus({
      id: deliveryOrder.salesOrderId,
      orderStatus: OrderStatus.SHIPPED
    });
    await deliveryModel.updateShippitStatus({
      status: 'despatch_in_progress',
      statusOwner: '',
      date: new Date(Date.now()).toDateString(),
      timestamp: new Date(Date.now()).toTimeString(),
      deliveryOrderId: deliveryOrder.id
    });
    log.out('OK_DELIVERY_CONFIRM-SHIPPIT-ORDER');
    res.json({
      message: `Confirmed Shippit DeliveryOrder with tracking number:${trackingNumber}`
    });
  } catch (error) {
    log.error('ERR_DELIVERY_CONFIRM-SHIPPIT-ORDER', error.message);
    res.json(Error.http(error));
  }
};

const getShippitOrderLabel = async (req, res) => {
  const { trackingNumber } = req.params;
  const { data, error } = await common.awaitWrap(
    deliveryModel.getShippitOrderLabel({ trackingNumber })
  );
  if (error) {
    log.error('ERR_DELIVERY_GET-SHIPPIT-ORDER-LABEL', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-SHIPPIT-ORDER-LABEL');
    res.json(data);
  }
};

const bookShippitDelivery = async (req, res) => {
  const { trackingNumber } = req.params;
  try {
    let deliveryOrder = await deliveryModel.findDeliveryOrderByTrackingNumber({
      trackingNumber
    });
    const deliveryBooking = await deliveryModel.bookShippitDelivery({
      trackingNumber
    });
    await salesOrderModel.updateSalesOrderStatus({
      id: deliveryOrder.salesOrderId,
      orderStatus: OrderStatus.DELIVERED
    });
    deliveryModel.updateShippitStatus({
      status: 'ready_for_pickup',
      statusOwner: deliveryBooking[0].manifest_pdf,
      date: new Date(Date.now()).toDateString(),
      timestamp: new Date(Date.now()).toTimeString(),
      deliveryOrderId: deliveryOrder.id
    });
    bookingManifestLabelLink = deliveryBooking.manifest_pdf;
    log.out('OK_DELIVERYORDER_BOOK-SHIPPIT-DELIVERY');
    res.json(deliveryBooking);
  } catch (error) {
    log.error('ERR_DELIVERYORDER_BOOK-SHIPPIT-DELIVERY', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  }
};

const getBookingLabelLink = async (req, res) => {
  const { trackingNumber } = req.params;
  const deliveryOrder = await deliveryModel.findDeliveryOrderByTrackingNumber({
    trackingNumber
  });
  const deliveryBooking = await prisma.DeliveryStatus.findMany({
    where: {
      deliveryOrderId: deliveryOrder.id,
      status: 'ready_for_pickup'
    }
  });
  return res.json(deliveryBooking[0].statusOwner);
};

const getLatLong = async (req, res) => {
  const { time_from, time_to } = req.body;
  const salesOrders =
    await deliveryModel.findSalesOrderPostalCodeForManualDeliveriesWithTimeFilter(
      {
        time_from: new Date(time_from),
        time_to: new Date(time_to)
      }
    );
  let dataRes = [];
  Promise.allSettled(
    salesOrders.map(async (p) => {
      const url = `https://developers.onemap.sg/commonapi/search?searchVal=${p.postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      return await axios
        .get(url)
        .then((response) => {
          log.out('OK_DELIVERY_GET-LAT-LONG');
          response.data.results[0].orders = p;
          dataRes.push(response.data.results[0]);
        })
        .catch((error) => {
          log.error('ERR_DELIVERY_GET-LAT-LONG', error.message);
        });
    })
  ).then(() => res.json(dataRes));
};

const getLatLongForAssignedOrders = async (req, res) => {
  const { time_from, time_to, id } = req.body;
  const salesOrders =
    await deliveryModel.findSalesOrderPostalCodeForAssignedManualDeliveriesWithTimeFilter(
      {
        time_from: new Date(time_from),
        time_to: new Date(time_to),
        id
      }
    );
  let dataRes = [];
  Promise.allSettled(
    salesOrders.map(async (p) => {
      const url = `https://developers.onemap.sg/commonapi/search?searchVal=${p.postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      return await axios
        .get(url)
        .then((response) => {
          log.out('OK_DELIVERY_GET-LAT-LONG');
          response.data.results[0].orders = p;
          dataRes.push(response.data.results[0]);
        })
        .catch((error) => {
          log.error('ERR_DELIVERY_GET-LAT-LONG', error.message);
        });
    })
  ).then(() => res.json(dataRes));
};

const getLatLongForUnassignedOrders = async (req, res) => {
  const { time_from, time_to } = req.body;
  const salesOrders =
    await deliveryModel.findSalesOrderPostalCodeForUnassignedManualDeliveries({
      time_from: new Date(time_from),
      time_to: new Date(time_to)
    });
  let dataRes = [];
  Promise.allSettled(
    salesOrders.map(async (p) => {
      const url = `https://developers.onemap.sg/commonapi/search?searchVal=${p.postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      return await axios
        .get(url)
        .then((response) => {
          log.out('OK_DELIVERY_GET-LAT-LONG');
          response.data.results[0].orders = p;
          dataRes.push(response.data.results[0]);
        })
        .catch((error) => {
          log.error('ERR_DELIVERY_GET-LAT-LONG', error.message);
        });
    })
  ).then(() => res.json(dataRes));
};
const getAllAssignedManualDeliveriesByUser = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await common.awaitWrap(
    deliveryModel.findAssignedManualDeliveriesByUser({ id })
  );
  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-DO-ASSIGNED-TO-USER', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-DO-ASSIGNED-TO-USER');
    res.json(data);
  }
};

const getAllUnassignedManualDeliveries = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    deliveryModel.findAllUnassignedManualDeliveries({})
  );
  if (error) {
    log.error('ERR_DELIVERY_GET-ALL-UNASSIGNED-DELIVERIES', error.message);
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-UNASSIGNED-DELIVERIES');
    res.json(data);
  }
};

const getAssignedManualDeliveriesByDate = async (req, res) => {
  const { time_from, time_to } = req.body;
  const { data, error } = await common.awaitWrap(
    deliveryModel.findAllAssignedManualDeliveriesByDate({
      time_from: new Date(time_from),
      time_to: new Date(time_to)
    })
  );
  if (error) {
    log.error(
      'ERR_DELIVERY_GET-ALL-ASSIGNED-MANUAL-DELIVERIES-BY-DATE',
      error.message
    );
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-ASSIGNED-MANUAL-DELIVERIES-BY-DATE');
    res.json(data);
  }
};

const getAssignedManualDeliveriesByDateByUser = async (req, res) => {
  const { time_from, time_to, assignedUserId } = req.body;
  console.log(assignedUserId);
  const { data, error } = await common.awaitWrap(
    deliveryModel.findAllAssignedManualDeliveriesByDateByUser({
      time_from: new Date(time_from),
      time_to: new Date(time_to),
      assignedUserId
    })
  );
  if (error) {
    log.error(
      'ERR_DELIVERY_GET-ALL-ASSIGNED-MANUAL-DELIVERIES-BY-DATE-BY-USER',
      error.message
    );
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-ASSIGNED-MANUAL-DELIVERIES-BY-DATE-BY-USER');
    res.json(data);
  }
};

const getUnassignedManualDeliveriesByDate = async (req, res) => {
  const { time_from, time_to } = req.body;
  const { data, error } = await common.awaitWrap(
    deliveryModel.findAllUnassignedManualDeliveriesByDate({
      time_from: new Date(time_from),
      time_to: new Date(time_to)
    })
  );
  if (error) {
    log.error(
      'ERR_DELIVERY_GET-ALL-UNASSIGNED-MANUAL-DELIVERIES-BY-DATE',
      error.message
    );
    res.json(Error.http(error));
  } else {
    log.out('OK_DELIVERY_GET-ALL-UNASSIGNED-MANUAL-DELIVERIES-BY-DATE');
    res.json(data);
  }
};

const getCurrentLocationLatLong = async (req, res) => {
  const { address } = req.body;
  const url = `https://developers.onemap.sg/commonapi/search?returnGeom=Y&getAddrDetails=Y&pageNum=1&searchVal=${address}`;
  return await axios
    .get(url)
    .then((response) => {
      log.out('OK_DELIVERY_GET-CURRENT-LOCATION-LAT-LONG');
      res.json(response.data.results[0]);
    })
    .catch((error) => {
      log.error('ERR_DELIVERY_GET-CURRENT-LOCATION-LAT-LONG', error.message);
      const e = Error.http(error);
      res.status(e.code).json(e.message);
    });
};

const generateDO = async (req, res) => {
  const doId = req.params;
  const deliveryOrder = await deliveryModel.findDeliveryOrderById(doId);
  const {
    id,
    createdAt,
    deliveryDate,
    shippingDate,
    carrier,
    comments,
    salesOrderId,
    deliveryMode,
    shippingType,
    assignedUserId
  } = deliveryOrder;
  const createdAtFormatted = format(createdAt, 'dd MMM yyyy');
  const shippingDateFormatted = format(deliveryDate, 'dd MMM yyyy');
  const salesOrder = await salesOrderModel.findSalesOrderById({
    id: salesOrderId
  });
  let assignedUser = {};
  if (assignedUserId !== null) {
    assignedUser = await userModel.findUserById({ id: assignedUserId });
  }
  await generateDeliveryOrderPdfTemplate({
    id,
    createdAtFormatted,
    shippingDateFormatted,
    carrier,
    comments,
    deliveryMode,
    shippingType,
    salesOrder,
    assignedUser
  })
    .then((pdfBuffer) => {
      res
        .writeHead(200, {
          'Content-Length': Buffer.byteLength(pdfBuffer),
          'Content-Type': 'application/pdf',
          'Content-disposition': 'attachment; filename = test.pdf'
        })
        .end(pdfBuffer);
    })
    .catch((error) => {
      log.error('ERR_PROCUREMENTORDER_GENERATE-DO-PDF', error.message);
      return res.status(error).json(error.message);
    });
};

exports.createManualDeliveryOrder = createManualDeliveryOrder;
exports.createShippitDeliveryOrder = createShippitDeliveryOrder;
exports.getAllDeliveryOrders = getAllDeliveryOrders;
exports.getAllManualDeliveryOrders = getAllManualDeliveryOrders;
exports.getAllShippitDeliveryOrders = getAllShippitDeliveryOrders;
exports.getAllGrabDeliveryOrders = getAllGrabDeliveryOrders;
exports.updateDeliveryOrder = updateDeliveryOrder;
exports.deleteDeliveryOrder = deleteDeliveryOrder;
exports.getDeliveryOrder = getDeliveryOrder;
exports.getDeliveryOrderBySalesOrderId = getDeliveryOrderBySalesOrderId;
exports.sendDeliveryOrderToShippit = sendDeliveryOrderToShippit;
exports.trackShippitOrder = trackShippitOrder;
exports.getLastestTrackingInfoOfOrder = getLastestTrackingInfoOfOrder;
exports.getAllShippitOrdersFromWebsite = getAllShippitOrdersFromWebsite;
exports.getToken = getToken;
exports.cancelShippitOrder = cancelShippitOrder;
exports.confirmShippitOrder = confirmShippitOrder;
exports.getShippitOrderLabel = getShippitOrderLabel;
exports.bookShippitDelivery = bookShippitDelivery;
exports.getLatLong = getLatLong;
exports.findDeliveriesWithTimeAndTypeFilter =
  findDeliveriesWithTimeAndTypeFilter;
exports.generateDO = generateDO;
exports.getAllAssignedManualDeliveriesByUser =
  getAllAssignedManualDeliveriesByUser;
exports.getCurrentLocationLatLong = getCurrentLocationLatLong;
exports.getAllUnassignedManualDeliveries = getAllUnassignedManualDeliveries;
exports.getDeliveryOrderByTrackingNumber = getDeliveryOrderByTrackingNumber;
exports.getLatLongForUnassignedOrders = getLatLongForUnassignedOrders;
exports.getLatLongForAssignedOrders = getLatLongForAssignedOrders;
exports.getBookingLabelLink = getBookingLabelLink;
exports.getAssignedManualDeliveriesByDate = getAssignedManualDeliveriesByDate;
exports.getUnassignedManualDeliveriesByDate =
  getUnassignedManualDeliveriesByDate;
exports.getAssignedManualDeliveriesByDateByUser =
  getAssignedManualDeliveriesByDateByUser;
