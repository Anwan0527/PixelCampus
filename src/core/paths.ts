/** 资源目录：人物/室内始终取自 generated；世界数据默认 generated，可用 ?world=<目录> 切换（如 generated-s1 = 5 m/格 对照版） */
export const G = 'assets/generated';
export const WD = `assets/${new URLSearchParams(location.search).get('world') ?? 'generated'}`;
