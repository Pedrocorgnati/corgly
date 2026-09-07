/**
 * `RTCSdpInit` e o nome novo que a especificacao WebRTC deu ao descritor de SDP,
 * mas a `lib.dom.d.ts` do TypeScript instalado ainda so declara
 * `RTCSessionDescriptionInit`. O codigo de sala virtual usa o nome novo, entao
 * este alias global fecha a lacuna sem mudar forma nem semantica do tipo.
 *
 * Quando a `lib.dom.d.ts` passar a declarar `RTCSdpInit`, este arquivo pode sair.
 */
declare global {
  type RTCSdpInit = RTCSessionDescriptionInit;
}

export {};
