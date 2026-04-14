insert into public.labs (name, college, room_code, value, manager, seat_count, notes)
select '软件开发技术实验室', '软件学院', '待补充-301', 0, '待指定', 0, '基础信息待补充'
where not exists (
  select 1 from public.labs where name = '软件开发技术实验室' and college = '软件学院'
);

insert into public.labs (name, college, room_code, value, manager, seat_count, notes)
select '测试技术实验室', '软件学院', '待补充-302', 0, '待指定', 0, '基础信息待补充'
where not exists (
  select 1 from public.labs where name = '测试技术实验室' and college = '软件学院'
);

insert into public.labs (name, college, room_code, value, manager, seat_count, notes)
select '数据结构和数据库实验室', '软件学院', '待补充-303', 0, '待指定', 0, '基础信息待补充'
where not exists (
  select 1 from public.labs where name = '数据结构和数据库实验室' and college = '软件学院'
);

insert into public.labs (name, college, room_code, value, manager, seat_count, notes)
select '游戏开发技术实验室', '数字孪生产业学院', '待补充-401', 0, '待指定', 0, '基础信息待补充'
where not exists (
  select 1 from public.labs where name = '游戏开发技术实验室' and college = '数字孪生产业学院'
);
