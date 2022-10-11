const productCatalogueModel = require('../models/productCatalogueModel');
const common = require('@kelchy/common');
const Error = require('../helpers/error');
const { log } = require('../helpers/logger');
const { uploadS3, getS3 } = require('../helpers/s3');

const createProductCatalogue = async (req, res) => {
  const { price, product, image } = req.body;

  if (image) {
    try {
      await uploadS3({
        key: `productCatalogueImages/${product.sku}-img`,
        payload: image
      });
    } catch (uploadS3Error) {
      log.error('ERR_PRODUCTCAT_UPLOAD-S3', uploadS3Error.message);
      const e = Error.http(uploadS3Error);
      res.status(e.code).json(e.message);
    }
  }
  log.out('OK_PRODUCTCAT_UPLOAD-S3');
  const { error } = await common.awaitWrap(
    productCatalogueModel.createProdCatalogue({
      price,
      productId: product.id
    })
  );
  if (error) {
    log.error('ERR_PRODUCTCAT_CREATE-PRODUCTCAT', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    log.out('OK_PRODUCTCAT_CREATE-PRODUCTCAT');
    res.json({ message: 'Product catalogue created' });
  }
};

const getAllProductCatalogue = async (req, res) => {
  const { data, error } = await common.awaitWrap(
    productCatalogueModel.getAllProdCatalogue({})
  );

  await Promise.all(
    data.map(async (prodCatalogue) => {
      const { data: productImg, error: getS3Error } = await common.awaitWrap(
        getS3({
          key: `productCatalogueImages/${prodCatalogue.product.sku}-img`
        })
      );

      if (getS3Error) {
        log.error('ERR_PRODUCT_GET-S3', getS3Error.message);
      }
      console.log(productImg);
      prodCatalogue.image = productImg;
    })
  );

  if (error) {
    log.error('ERR_PRODUCTCAT_GET-ALL-PRODUCTCAT', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    log.out('OK_PRODUCTCAT_GET-ALL-PRODUCTCAT');
    res.json(data);
  }
};

const getProductCatalogue = async (req, res) => {
  try {
    const { id } = req.params;
    const prodCatalogue = await productCatalogueModel.findProdCatalogueById({
      id
    });
    console.log(prodCatalogue);
    const { data: productImg, error: getS3Error } = await common.awaitWrap(
      getS3({
        key: `productCatalogueImages/${prodCatalogue.product.sku}-img`
      })
    );

    if (getS3Error) {
      log.error('ERR_PRODUCT_GET-S3', getS3Error.message);
    }
    prodCatalogue.image = productImg;
    log.out('OK_PRODUCTCAT_GET-PRODUCTCAT-BY-ID');
    res.json(prodCatalogue);
  } catch (error) {
    log.error('ERR_PRODUCTCAT_GET-PRODUCTCAT', error.message);
    res.status(500).send('Server Error');
  }
};

const updateProductCatalogue = async (req, res) => {
  const { id, price, image, product } = req.body;

  if (image) {
    const { error: uploadS3Error } = await common.awaitWrap(
      uploadS3({
        key: `productCatalogueImages/${product.sku}-img`,
        payload: image
      })
    );
    if (uploadS3Error) {
      log.error('ERR_PRODUCTCAT_UPLOAD-S3', uploadS3Error.message);
      const e = Error.http(uploadS3Error);
      res.status(e.code).json(e.message);
    }
    log.out('OK_PRODUCTCAT_UPLOAD-S3');
  }
  const { error } = await common.awaitWrap(
    productCatalogueModel.updateProdCatalogue({ id, price })
  );

  if (error) {
    log.error('ERR_PRODUCTCAT_UPDATE_PRODUCTCAT', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    log.out('OK_PRODUCTCAT_UPDATE_PRODUCTCAT');
    res.json({ message: `Updated product catalogue with id:${id}` });
  }
};

const deleteProductCatalogue = async (req, res) => {
  const { id } = req.params;
  const { error } = await common.awaitWrap(
    productCatalogueModel.deleteProdCatalogue({ id })
  );
  if (error) {
    log.error('ERR_PRODUCTCAT_DELETE_PRODUCTCAT', error.message);
    const e = Error.http(error);
    res.status(e.code).json(e.message);
  } else {
    log.out('OK_PRODUCTCAT_DELETE_PRODUCTCAT');
    res.json({ message: `Deleted product category with id:${id}` });
  }
};

exports.createProductCatalogue = createProductCatalogue;
exports.getAllProductCatalogue = getAllProductCatalogue;
exports.updateProductCatalogue = updateProductCatalogue;
exports.deleteProductCatalogue = deleteProductCatalogue;
exports.getProductCatalogue = getProductCatalogue;