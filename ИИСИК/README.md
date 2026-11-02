# Система управления ремонтом бытовой техники — лабораторная работа №4

Проект продолжает ЛР3. Внешний API реализован на GraphQL. Внутренняя логика разделена на семь сервисов: Identity, Customer, Catalog, Repair, Payment, Notification и Analytics.

## Архитектура и соответствие методическим указаниям

- `contracts/schema.graphql` — единый GraphQL-контракт, который загружается GraphQL Gateway при запуске.
- `src/gateway` — только внешний GraphQL-слой: разбор запроса, контекст пользователя, проверка доступа к операциям, преобразование результата в GraphQL-модель и передача вызова клиенту сервиса.
- `src/clients` — mock-клиенты с контрактами вызовов внутренних сервисов. Gateway зависит только от этих клиентов и не импортирует репозитории, SQLite или SQL-запросы.
- `src/services/<name>/api.js` — API-фасад конкретного сервиса. В нём объединены операции чтения и бизнес-операции этого сервиса.
- `src/services/<name>/index.js` — модель данных, репозитории и бизнес-правила сервиса. Каждый сервис открывает собственную SQLite-БД.
- `src/services/<name>/server.js` — отдельная точка запуска каждого сервиса. Доступны `GET /health` и `GET /contract`.

**Важно для ЛР4:** методические указания требуют использовать временные заглушки вместо реального gRPC. Поэтому mock-клиенты вызывают API-фасады сервисов в рамках процесса GraphQL Gateway. Семь сервисов при этом имеют отдельные модули, собственные БД и самостоятельные точки запуска/проверки. HTTP/gRPC-вызовы между процессами намеренно не добавлялись, чтобы не подменять требуемые заглушки реальным сетевым взаимодействием.

## Требования

- Node.js 18 или новее;
- npm;
- Windows, Linux или macOS.

## Установка и первый запуск

```bash
npm ci
npm run seed
npm start
```

GraphQL Gateway: `http://127.0.0.1:4000/graphql`.
Проверка состояния: `http://127.0.0.1:4000/health`.

Демонстрационные учётные записи:

| Роль | Токен |
|---|---|
| Клиент | `jwt-client-1` |
| Сотрудник | `jwt-employee-1` |
| Администратор | `jwt-admin-1` |

Для авторизованных GraphQL-запросов передавайте заголовок `Authorization: Bearer jwt-client-1` (замените токен на соответствующую роль).

## Самостоятельный запуск внутренних сервисов

Каждый сервис можно запустить отдельной командой:

```bash
npm run service:identity
npm run service:customer
npm run service:catalog
npm run service:repair
npm run service:payment
npm run service:notification
npm run service:analytics
```

Либо запустить все семь сервисов вместе с Gateway:

```bash
npm run start:all
```

Порты внутренних сервисов: Identity — 4101, Customer — 4102, Catalog — 4103, Repair — 4104, Payment — 4105, Notification — 4106, Analytics — 4107. У каждого сервиса доступны `/health` и `/contract`. Gateway работает на порту 4000. Скрипт `start:all` предварительно проверяет занятость портов и сообщает, какой порт нужно освободить. Для остановки нажмите `Ctrl+C`.

## Реализованные GraphQL Query

- `me`, `myDevices`, `device` — данные пользователя и его устройств;
- `myRepairRequests`, `repairRequest`, `repairQueue` — заявки, очередь, фильтрация по статусу, категории, приоритету и периоду, сортировка по дате, приоритету или стоимости;
- `workOrder` — заказ-наряд;
- `catalogServices`, `catalogParts` — фильтрация по поисковой строке и активности, сортировка по названию, цене или остатку;
- `myNotifications` — уведомления клиента;
- `analyticsSummary(from,to)` — агрегированные показатели за период, включая количество заявок, выручку, число платежей и рейтинги востребованных услуг/категорий.

## Реализованные GraphQL Mutation

- регистрация пользователя и вход;
- назначение роли пользователя;
- регистрация и изменение данных устройства;
- создание заявки на ремонт;
- приём заявки, начало диагностики, согласование или отклонение сметы, завершение заказ-наряда, перевод устройства в готовность, закрытие и отмена заявки;
- добавление услуги и запчасти в заказ-наряд, пересчёт стоимости;
- регистрация оплаты;
- создание и обновление услуг и запчастей каталога.

Бизнес-правила находятся в сервисах: проверяются обязательные поля, допустимые приоритеты и переходы статусов, принадлежность устройства/заявки клиенту, доступность услуги и запчасти, складской остаток, количество и цена, а также сумма оплаты относительно стоимости заказ-наряда. Некорректные действия возвращают GraphQL errors с кодами ошибок.

## Примеры запросов

### Очередь заявок с фильтрацией и сортировкой

```graphql
query {
  repairQueue(filter: { status: IN_REPAIR, priority: HIGH }, sort: PRIORITY) {
    id description priority status createdAt
  }
}
```

### Каталог услуг

```graphql
query {
  catalogServices(filter: { search: "диагностика", active: true }, sort: PRICE_ASC) {
    id name price isActive
  }
}
```

### Создание заявки

```graphql
mutation {
  createRepairRequest(input: {
    deviceId: "d-1"
    description: "Не включается"
    priority: HIGH
  }) {
    id status description priority
  }
}
```

### Добавление услуги в заказ-наряд

```graphql
mutation {
  addWorkOrderService(workOrderId: "wo-1", serviceId: "s-diag", quantity: 1) {
    id serviceName quantity lineTotal
  }
}
```

### Агрегированная статистика

```graphql
query {
  analyticsSummary(from: "2026-09-01", to: "2026-10-31") {
    requestsCreated requestsReady requestsClosed requestsCancelled
    openRepairs revenue paymentsCount
    topServices { serviceName itemsCount amountSum }
    topCategories { categoryName requestsCount }
  }
}
```

## Проверка

```bash
npm run check
npm test
```

`npm run check` проверяет построение GraphQL SDL, наличие resolver-полей, Mutation, структуру семи сервисов и отсутствие прямого доступа Gateway/клиентов к SQLite. `npm test` дополнительно выполняет сценарные проверки Query, фильтрации, сортировки, создания заявки, перехода статуса, оплаты, агрегации и отклонения некорректных операций.

Начальные данные создаются командой `npm run seed`. Базы данных располагаются в `data/` (по одной на сервис).
