require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../../docs/swagger.json');
const errorHandler = require('./middlewares/errorHandler');
const authRoutes = require('./routes/auth.routes');
const { router: promotionsRoutes, adminRouter: adminPromotionsRoutes } = require('./routes/promotions.routes');
const applicationsRoutes = require('./routes/applications.routes');
const usersRoutes = require('./routes/users.routes');

const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));

// ponytail: temporary placeholder, real routes land in BE-2+
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 운영환경(NODE_ENV=production)에서는 API 스펙을 외부에 노출하지 않는다.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

app.use('/auth', authRoutes);
app.use('/promotions', promotionsRoutes);
app.use('/admin/promotions', adminPromotionsRoutes);
app.use(applicationsRoutes);
app.use('/users', usersRoutes);

app.use(errorHandler);

module.exports = app;
