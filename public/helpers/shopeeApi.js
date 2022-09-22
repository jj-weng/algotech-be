const axios = require('axios').default;
const CryptoJS = require('crypto-js');
const host = 'https://partner.shopeemobile.com';
// const host = 'https://partner.test-stable.shopeemobile.com'
const partner_id = 2004004;
const shop_id = 2421911;
const shop_test_id = 52362;
const redirect_url = 'https://www.google.com/';

const timestamp = Math.floor(new Date().getTime() / 1000);

const generateSign = async (partner_key, secret) => {
  const key = CryptoJS.enc.Utf8.parse(partner_key);
  const msg = CryptoJS.enc.Utf8.parse(secret);
  const token = CryptoJS.enc.Hex.stringify(CryptoJS.HmacSHA256(msg, key));
  return token;
};

// generate an authorized link
const generateLink = async (req) => {
  const v2_path = '/api/v2/shop/auth_partner';
  const baseString = partner_id + v2_path + timestamp;
  const token = await generateSign(process.env.PARTNER_KEY, baseString);
  const url =
    host +
    v2_path +
    `?partner_id=${partner_id}&timestamp=${timestamp}&sign=${token}&redirect=${redirect_url}`;

  return url;
};

const refreshToken = async (req) => {
  const { refresh_token } = req;

  const path = '/api/v2/auth/access_token/get';
  const body = {
    shop_id: parseInt(shop_id),
    refresh_token: refresh_token,
    partner_id: parseInt(partner_id)
  };
  const baseString = partner_id + path + timestamp;
  const token = await generateSign(process.env.PARTNER_KEY, baseString);

  const url =
    host +
    path +
    `?partner_id=${partner_id}&timestamp=${timestamp}&sign=${token}`;

  return await axios
    .post(url, body)
    .then((res) => {
      console.log(res.data);
      const response = res.data;
      return response;
    })
    .catch((err) => {
      console.log(err);
    });
};

const getAllOrders = async (req) => {
  const { access_token, time_from, time_to, page_size } = req;
  const path = '/api/v2/order/get_order_list';
  const baseString = partner_id + path + timestamp + access_token + shop_id;
  const token = await generateSign(process.env.PARTNER_KEY, baseString);
  const time_range_field = 'create_time';
  url = `${host}${path}?timestamp=${timestamp}&time_range_field=${time_range_field}&sign=${token}&access_token=${access_token}&shop_id=${shop_id}&time_from=${time_from}&time_to=${time_to}&page_size=${page_size}&partner_id=${partner_id}`;
  return await axios
    .get(url)
    .then((res) => {
      const response = res.data;
      return response;
    })
    .catch((err) => {
      console.log(err);
    });
};

exports.generateLink = generateLink;
exports.refreshToken = refreshToken;
exports.getAllOrders = getAllOrders;
