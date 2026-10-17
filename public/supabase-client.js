// 브라우저용 Supabase 클라이언트. 공개 키(publishable)만 쓰며, 접근 제한은 DB 의 RLS·권한이 맡는다.
(function () {
  const cfg = window.APP_CONFIG;
  window.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    // flowType pkce: 이메일 확인 링크가 #access_token 대신 ?code= 로 돌아오므로 #/report 같은 화면 주소와 충돌하지 않는다.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
})();
