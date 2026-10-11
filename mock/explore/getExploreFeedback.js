// 反馈写接口 mock：POST /persona/feedback（like|somewhat|dislike）+ POST /unknown/{id}/feedback（interested|not_interested|already_read）
const UNKNOWN_IDS = ['u_1', 'u_2', 'u_3'];

export default [
  {
    path: '/persona/feedback',
    data: (params) => ({ saved: true, type: params.type }),
  },
  ...UNKNOWN_IDS.map((id) => ({
    path: `/unknown/${id}/feedback`,
    data: (params) => ({ saved: true, id, type: params.type }),
  })),
];
