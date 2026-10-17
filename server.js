// Vercel 진입점. 로컬에서는 `npm start`(src/server.js)를 그대로 쓰고, Vercel 은 이 파일을 실행한다.
// 서버는 정적 파일과 공개 설정만 내려준다. 데이터는 브라우저가 Supabase 에 직접 저장하므로
// DB 비밀번호·서버 비밀값·영구 디스크가 필요 없다.
const { createApp } = require('./src/server');

const onVercel = Boolean(process.env.VERCEL);
const { server } = createApp();

// Vercel 은 PORT 로 연결한다. 로컬에서는 기존처럼 127.0.0.1 에만 연다.
server.listen(Number(process.env.PORT) || 3000, onVercel ? undefined : '127.0.0.1', () => {
  console.log(`AI Security Check listening on port ${server.address().port}`);
});
