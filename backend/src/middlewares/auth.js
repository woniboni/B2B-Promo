const jwt = require('jsonwebtoken');

// BE-4에서 admin 체크는 컨트롤러가 req.user.role !== 'admin' 조건문으로 처리한다.
// 이 미들웨어는 Access Token 검증(로그인 여부)만 담당한다.
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(Object.assign(new Error('인증이 필요합니다.'), { status: 401 }));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    next(Object.assign(new Error('인증이 필요합니다.'), { status: 401 }));
  }
}

module.exports = auth;
