const axios = require('axios');

const getToken = async (req) => {
  const path = 'https://app.staging.shippit.com/api/ui/v1/auth/jwt.json';
  const options = {
    headers: {
      'Cookie': process.env.SHIPPIT_COOKIE
    },
  };
  return await axios
    .get(path, options)
    .then((res) => {
      const response = res.data;
      return response.token;
    })
    .catch((err) => { 
      console.log(err);
    });
};

exports.getToken = getToken;