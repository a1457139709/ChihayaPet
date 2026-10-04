const expressionNames: Readonly<Record<string, string>> = {
  '00': '日常', '01': '疑惑', '02': '轻笑', '03': '害羞慌张',
  '04': '开心', '05': '不满', '06': '惊讶', '07': '生气',
  '08': '皱眉', '09': '困扰', '10': '震惊', '11': '奇怪',
};
const sideExpressionNames: Readonly<Record<string, string>> = {
  '00': '日常（浅笑）', '01': '思考', '02': '轻蔑', '03': '生气',
  '04': '坏笑', '05': '无奈', '06': '震惊',
};

export function expressionLabel(outfit: string, id: string): string {
  if (id === 'automatic') return '自动';
  const names = outfit === 'b' || outfit === 'b_' ? sideExpressionNames : expressionNames;
  return names[id] ? `${id} · ${names[id]}` : id;
}
