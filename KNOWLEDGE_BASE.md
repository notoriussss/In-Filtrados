# Graph Report - In-Filtrados  (2026-10-26)

## Corpus Check
- cluster-only mode â€” file stats not available

## Summary
- 3502 nodes Â· 8005 edges Â· 227 communities (197 shown, 30 thin omitted)
- Extraction: 95% EXTRACTED Â· 5% INFERRED Â· 0% AMBIGUOUS Â· INFERRED: 419 edges (avg confidence: 0.86)
- Token cost: 0 input Â· 0 output

## Graph Freshness
- Built from commit: `ba2f1818`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lobby.tsx
- Room
- match.pb.go
- game/session.ts
- consumer.rs
- google.golang.org/protobuf/reflect/protoreflect.Message
- testing.T
- world.ts
- minigames.ts
- options.go
- gateway/package.json
- Snapshot
- JoinRoomRequest
- map.ts
- resilience.ts
- Queries
- test_events.py
- ServerEvent
- main.py
- in-filtrados-ui-runtime.js
- game.gateway.ts
- auth.controller.ts
- with
- file_match_proto_rawDescGZIP
- socket.ts
- GameSession
- play-relay.ts
- in-filtrados-personajes.js
- web/package.json
- accounts.rs
- context.Context
- server-events.ts
- HealthMonitor
- environment
- setupServer
- Meeting.tsx
- players
- playerAnim.ts
- api.module.ts
- tanks_test.go
- valveScene.ts
- persist.go
- sabotage_test.go
- bucketsScene.ts
- events.go
- .new
- Map
- ClientAction
- Settings.tsx
- .canWorkOn
- grpc.rs
- main
- rabbitmq
- ParticlesScene
- PX
- test_health.py
- with
- color_test.go
- Hud.tsx
- BucketsScene
- environment
- Access.tsx
- DirectionInput
- compilerOptions
- players.ts
- minigameDraw.ts
- sync.Mutex
- PoolChecker
- Interact
- AMQPPublisher
- jobs
- Meeting
- PlayerView
- Vote
- workPose.ts
- environment
- match-db
- main.rs
- nearStation
- tasks_test.go
- particlesScene.ts
- compilerOptions
- hero.ts
- A-dia
- ChatMessage
- sql
- Chat
- Move
- MatchEnded
- make_message_handler
- Hero
- flood-ws.mjs
- monitor
- Contaminate
- Fix
- PickAccessory
- PickColor
- assets.ts
- LogEntry
- services
- match
- outputs
- Start
- progress.rs
- activityFx.ts
- environment
- environment
- healthcheck
- Stage.tsx
- context
- gateway
- rabbitmq
- hud-alerta
- hud-laguna
- hud-minimapa
- hud-rol-cubeta
- hud-tareas
- boton-def-active
- boton-def-disabled
- boton-def-hover
- boton-def-normal
- boton-pri-active
- boton-pri-disabled
- boton-pri-hover
- boton-pri-normal
- boton-sec-normal
- messages/package.json
- SnapshotWriter
- players
- hud-accion-chat
- hud-accion-reportar
- hud-accion-usar
- hud-acciones
- hud-etiqueta-jugador
- hud-etiqueta-propia
- hud-tecla
- boton-amber-active
- boton-amber-disabled
- boton-amber-hover
- boton-amber-normal
- boton-dan-active
- boton-dan-disabled
- boton-dan-hover
- boton-dan-normal
- boton-sec-active
- boton-sec-disabled
- boton-sec-hover
- campo-foco
- campo-normal
- codigo-sala
- deslizador-0
- deslizador-100
- deslizador-50
- fila-tabla
- fila-tabla-activa
- jugador-ranura
- jugador-ranura-propia
- jugador-ranura-vacia
- marco-imagen
- medidor-agua-0
- medidor-agua-100
- medidor-agua-50
- medidor-amber-0
- medidor-amber-100
- medidor-amber-50
- medidor-bad-0
- medidor-bad-100
- medidor-bad-50
- medidor-leaf-0
- medidor-leaf-100
- medidor-leaf-50
- opcion-activa
- opcion-normal
- panel-claro
- panel-madera
- panel-oscuro
- pildora
- pozo
- pozo-oscuro
- tablon
- tarjeta-activa
- tarjeta-normal
- env
- ._newer
- accesorio-normal
- boton-pri-pequeno-normal
- boton-sec-pequeno-normal
- chip-bad
- chip-grande-bad
- chip-grande-info
- chip-grande-neutro
- chip-grande-ok
- chip-grande-warn
- chip-info
- chip-neutro
- chip-ok
- chip-warn
- interruptor-apagado
- interruptor-encendido
- muestra-color-normal
- pestana-activa
- pestana-normal
- punto-estado
- selector-segmentado
- tecla
- match
- node
- players
- eco
- True
- package.json
- eco
- .pickAccessory
- clamp
- B-noche
- gen.sh
- Interact_StationId
- Interact_TankSlot
- UnsafeMatchServer
- Vote_Skip
- Vote_TargetPlayerId
- github.com/notoriussss/in-filtrados/match
- monitor
- players

## God Nodes (most connected - your core abstractions)
1. `Room` - 120 edges
2. `A-dia` - 79 edges
3. `Snapshot` - 44 edges
4. `PX` - 42 edges
5. `EventStats` - 39 edges
6. `GameSession` - 37 edges
7. `Icon()` - 36 edges
8. `Chip()` - 36 edges
9. `ServerEvent` - 35 edges
10. `file_match_proto_rawDescGZIP()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `FakeSocket` --references--> `ClientMessage`  [EXTRACTED]
  web/src/net/socket.test.ts â†’ messages/src/index.ts
- `GameSocket` --references--> `ServerMessage`  [EXTRACTED]
  web/src/net/socket.ts â†’ messages/src/index.ts
- `lifespan()` --uses--> `EventStats`  [INFERRED]
  monitor/app/main.py â†’ monitor/app/events.py
- `test_consumer_retries_until_rabbitmq_is_up()` --uses--> `EventStats`  [INFERRED]
  monitor/tests/test_events.py â†’ monitor/app/events.py
- `test_handler_applies_event_before_ack()` --uses--> `EventStats`  [INFERRED]
  monitor/tests/test_events.py â†’ monitor/app/events.py

## Import Cycles
- None detected.

## Communities (227 total, 30 thin omitted)

### Community 0 - "Lobby.tsx"
Cohesion: 0.07
Nodes (82): react, api, AuthResponse, MeResponse, RegisterResponse, RoomResponse, App(), Route (+74 more)

### Community 1 - "Room"
Cohesion: 0.04
Nodes (15): defaultAccessoryForColor(), isPlayerColor(), tallyVotes(), roleName(), isEmergencyKind(), clampDir(), PlayerAction, chatEntry (+7 more)

### Community 3 - "game/session.ts"
Cohesion: 0.06
Nodes (50): ClientMessage, Emergency, EmergencyKind, ErrorCode, MyTask, Phase, Role, Snapshot (+42 more)

### Community 4 - "consumer.rs"
Cohesion: 0.06
Nodes (39): accepts_the_payload_published_by_match(), coins_for(), consume(), CONSUMER_TAG, event_json(), event_json_won_by(), EXCHANGE, handle_message() (+31 more)

### Community 5 - "google.golang.org/protobuf/reflect/protoreflect.Message"
Cohesion: 0.04
Nodes (9): Emergency, Room, SabotageStatus, ClientAction_Report, Error, Join, Report, ServerEvent_Error (+1 more)

### Community 6 - "testing.T"
Cohesion: 0.08
Nodes (49): setupPlayingRoom(), TestHarvestFormula(), TestWinCondition_AllImpostorsEjected(), TestWinCondition_EightMinutesTimeout(), TestWinCondition_ImpostorParity(), TestWinCondition_Reservoir100(), TestWinCondition_TwoImpostors_BothMustBeEjected(), disconnect() (+41 more)

### Community 7 - "world.ts"
Cohesion: 0.08
Nodes (42): OilDrop, vitest, MapAssets, applyWorldTransform(), Bounds, Camera, clampAxis(), clampCamera() (+34 more)

### Community 8 - "minigames.ts"
Cohesion: 0.05
Nodes (20): SceneEnv, BaseGame, Bucket, BUCKET_COUNT, BUCKET_SIZE, BucketsGame, createMinigame(), FLOOR_Y (+12 more)

### Community 9 - "options.go"
Cohesion: 0.09
Nodes (43): Server, WithSnapshots(), GenerateCode(), TestGenerateCode(), SavedSnapshot, SnapshotSaver, TestMatchEndedBroadcastOnEventOut(), TestRoomMemoryCleanupAfterDelay() (+35 more)

### Community 10 - "gateway/package.json"
Cohesion: 0.05
Nodes (49): dependencies, class-transformer@^0.5.1, class-validator@^0.15.1, @grpc/grpc-js@^1.14.5, @grpc/proto-loader@^0.8.1, @in-filtrados/messages@*, @nestjs/common@^10.0.0, @nestjs/core@^10.0.0 (+41 more)

### Community 11 - "Snapshot"
Cohesion: 0.06
Nodes (4): Phase, Role, Snapshot, savedPlayer

### Community 12 - "JoinRoomRequest"
Cohesion: 0.05
Nodes (11): MatchClient, UnimplementedMatchServer, _Match_CreateRoom_Handler(), _Match_JoinRoom_Handler(), _Match_Play_Handler(), NewMatchClient(), RegisterMatchServer(), CreateRoomRequest (+3 more)

### Community 13 - "map.ts"
Cohesion: 0.08
Nodes (28): buildTaskList(), completionDelay(), MIN_TASK_MS, pickStation(), roomName(), SEND_MARGIN_MS, stationRange(), TASK_RANGE (+20 more)

### Community 14 - "resilience.ts"
Cohesion: 0.09
Nodes (21): DEADLINE_MS, loadPackage(), requireAddr(), unary(), MatchClient, PlayStream, RoomReply, BREAKER_OPTIONS (+13 more)

### Community 15 - "Queries"
Cohesion: 0.09
Nodes (18): CreateMatchParams, CreateParticipantParams, EventLog, FinishMatchParams, InsertEventParams, InsertOutboxParams, ListOutboxRow, ListUnfinishedSnapshotsRow (+10 more)

### Community 16 - "test_events.py"
Cohesion: 0.15
Nodes (27): EventStats, Clock, counts_by_type(), disconnected(), ejected(), finished(), reconnected(), started() (+19 more)

### Community 17 - "ServerEvent"
Cohesion: 0.08
Nodes (27): Match_PlayServer, ServerEvent, badMessage(), matchNotFoundError(), interactAction(), drain(), snapOf(), waitTicks() (+19 more)

### Community 18 - "main.py"
Cohesion: 0.08
Nodes (12): _connect(), consume_events(), _consume_once(), _liters(), get_http_targets(), utc_now(), get_dashboard(), get_health() (+4 more)

### Community 19 - "in-filtrados-ui-runtime.js"
Cohesion: 0.10
Nodes (22): accLayer(), ball(), bodyLayer(), character(), characterSheet(), drawAccessory(), face(), halo() (+14 more)

### Community 20 - "game.gateway.ts"
Cohesion: 0.10
Nodes (30): ChatDeduper, isAxis(), isShortString(), isSlot(), parseChat(), parseClientMessage(), parseInteract(), parseVote() (+22 more)

### Community 21 - "auth.controller.ts"
Cohesion: 0.10
Nodes (12): AuthController, CredentialsDto, AuthedRequest, AuthGuard, STATUS_MAP, toHttpException(), PlayerReply, PlayersClient (+4 more)

### Community 22 - "with"
Cohesion: 0.05
Nodes (37): concurrency, cancel-in-progress, group, jobs, publish, service, name, contents (+29 more)

### Community 23 - "file_match_proto_rawDescGZIP"
Cohesion: 0.06
Nodes (6): file_match_proto_rawDescGZIP(), MyTask, OilDrop, TankView, myTasks(), sharedState

### Community 24 - "socket.ts"
Cohesion: 0.09
Nodes (14): ServerMessage, CLOSE_NORMAL, CLOSE_REPLACED, CLOSE_UNAUTHORIZED, GameSocket, GameSocketOptions, reconnectDelay(), RETRY_DELAYS_MS (+6 more)

### Community 25 - "GameSession"
Cohesion: 0.09
Nodes (8): actionMessage(), HoldAction, tankRose(), preloadSprites(), GameSession, sameAction(), ChatQueue, openGameSocket()

### Community 26 - "play-relay.ts"
Cohesion: 0.08
Nodes (14): PLAY_RETRY_DELAYS_MS, PLAY_RETRY_MAX_MS, GameGateway, send(), JoinInfo, PlayRelay, PlayRelayOptions, playRetryDelay() (+6 more)

### Community 27 - "in-filtrados-personajes.js"
Cohesion: 0.12
Nodes (21): accLayer(), ball(), bodyLayer(), character(), characterSheet(), drawAccessory(), face(), halo() (+13 more)

### Community 28 - "web/package.json"
Cohesion: 0.07
Nodes (33): typescript@^5.0.0, jsdom, react-dom, @testing-library/react, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+25 more)

### Community 29 - "accounts.rs"
Cohesion: 0.09
Nodes (24): AccountError, AlreadyExists, Database, Internal, InvalidCredentials, InvalidPassword, InvalidToken, InvalidUsername (+16 more)

### Community 30 - "context.Context"
Cohesion: 0.14
Nodes (19): flakyPublisher, memStore, OutboxPublisher, OutboxStore, raceStore, mockPingable, Publisher, eventIDOf() (+11 more)

### Community 31 - "server-events.ts"
Cohesion: 0.09
Nodes (22): LoginThrottlerGuard, guard(), parse(), ACTIVITIES, EMERGENCY_KINDS, GrpcEmergency, GrpcMatchEnded, GrpcMeeting (+14 more)

### Community 32 - "HealthMonitor"
Cohesion: 0.17
Nodes (17): HealthMonitor, simulate_checks(), test_async_timeout(), test_connection_error_hides_secrets(), failing_check(), test_db_down_and_incident_when_parent_reports_fail(), test_db_ok_when_parent_reports_ok(), test_db_unknown_without_incident_when_parent_down() (+9 more)

### Community 33 - "environment"
Cohesion: 0.06
Nodes (30): match-db, HTTP_PORT, MAP_PATH, MATCH_DB_URL, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, RABBITMQ_URL (+22 more)

### Community 34 - "setupServer"
Cohesion: 0.10
Nodes (20): ServerOption, graceFromEnv(), TestGraceFromEnv(), Match_PlayClient, TestStartFromNonCreatorIsIgnored(), TestStartThroughStream(), waitForPhase(), NewServer() (+12 more)

### Community 35 - "Meeting.tsx"
Cohesion: 0.14
Nodes (20): Meeting, PlayerView, endTitle(), MeetingPlayer, MeetingView, nameOf(), resultText(), secondsLeft() (+12 more)

### Community 36 - "players"
Cohesion: 0.07
Nodes (28): players-db, HTTP_PORT, PLAYERS_DB_URL, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, RABBITMQ_URL, interval (+20 more)

### Community 37 - "playerAnim.ts"
Cohesion: 0.10
Nodes (19): CYCLES, DOWN_CYCLE, Heading, headingOf(), LEFT_CYCLE, MIN_WORK_MS, PlayerAnimator, PlayerPose (+11 more)

### Community 38 - "api.module.ts"
Cohesion: 0.09
Nodes (9): ApiModule, AppModule, AUTH_MESSAGES, LOGIN_RATE_LIMIT, ClientsModule, isCircuitOpen(), GameModule, HealthController (+1 more)

### Community 39 - "tanks_test.go"
Cohesion: 0.27
Nodes (24): contaminateDone(), TestCleaningDropsNoOil(), TestContaminateDropsOilWithImpostorColor(), TestOilDropsExpireAfterFifteenSeconds(), TestOilTrailLastsFifteenSeconds(), TestSnapshotCarriesOilDrops(), clean(), contaminate() (+16 more)

### Community 40 - "valveScene.ts"
Cohesion: 0.14
Nodes (15): flourishPose(), drawTapRing(), hash01(), pxDisc(), pxLine(), pxRing(), snap(), drawGaugeFace() (+7 more)

### Community 41 - "persist.go"
Cohesion: 0.11
Nodes (13): Checker, Handler, Response, NewHandler(), TestHealthHandler_StatusDegraded(), TestHealthHandler_StatusOK(), savedChat, savedEmergency (+5 more)

### Community 42 - "sabotage_test.go"
Cohesion: 0.24
Nodes (23): WithEmergencyRand(), advance(), player, mapWithFixPoints(), restoreFrom(), sabotage(), sabotageRoom(), standAt() (+15 more)

### Community 43 - "bucketsScene.ts"
Cohesion: 0.15
Nodes (22): REACH, TUCK, bucketSprite(), drawGauges(), DROP_ROWS, INNER, Pour, RIM (+14 more)

### Community 44 - "events.go"
Cohesion: 0.14
Nodes (20): MatchFinished, MatchStarted, PlayerDisconnected, PlayerEjected, PlayerReconnected, PlayerResult, TaskCompleted, formatPreciseTime() (+12 more)

### Community 45 - ".new"
Cohesion: 0.25
Nodes (15): duplicate_username_is_already_exists(), expired_token_is_unauthenticated(), invalid_username_and_password_are_invalid_argument(), login_returns_a_token_valid_for_24_hours(), new_player_profile_starts_at_zero(), PlayersService, register_player(), register_saves_a_player_with_an_argon2_hash() (+7 more)

### Community 46 - "Map"
Cohesion: 0.14
Nodes (15): reachable(), sharedMap(), TestEverythingIsReachable(), TestLoadMapErrors(), TestMoveDoesNotGoThroughWalls(), TestMoveSlidesAlongWalls(), TestMoveStaysInsideTheWorld(), TestSpawnPoints() (+7 more)

### Community 47 - "ClientAction"
Cohesion: 0.09
Nodes (5): ClientAction, ClientAction_Join, ClientAction_Sabotage, isClientAction_Action, Sabotage

### Community 48 - "Settings.tsx"
Cohesion: 0.16
Nodes (15): Row(), Segmented(), Settings(), TabId, TABS, Toggle(), applySettings(), defaultSettings() (+7 more)

### Community 49 - ".canWorkOn"
Cohesion: 0.15
Nodes (5): nearDeadTank(), nearFixPoint(), isMoving(), nearTank(), tank

### Community 50 - "grpc.rs"
Cohesion: 0.12
Nodes (9): SKIP_NOTICE, TEST_PASSWORD, ERR_MSG_ALREADY_EXISTS, ERR_MSG_INTERNAL, ERR_MSG_INVALID_CREDENTIALS, ERR_MSG_INVALID_PASSWORD, ERR_MSG_INVALID_TOKEN, ERR_MSG_INVALID_USERNAME (+1 more)

### Community 51 - "main"
Cohesion: 0.13
Nodes (12): DBTX, Store, getenv(), main(), restoreRooms(), runMigrations(), New(), NewEventLogWriter() (+4 more)

### Community 52 - "rabbitmq"
Cohesion: 0.10
Nodes (20): RABBITMQ_DEFAULT_PASS, RABBITMQ_DEFAULT_USER, interval, retries, start_period, test, timeout, name (+12 more)

### Community 53 - "ParticlesScene"
Cohesion: 0.18
Nodes (4): easeInOut(), ParticlesScene, mix(), celebrateK()

### Community 54 - "PX"
Cohesion: 0.18
Nodes (18): drawShelves(), drawTankBack(), drawTankFront(), drawMachine(), drawTankBack(), drawTankFront(), bakeBoard(), PX (+10 more)

### Community 55 - "test_health.py"
Cohesion: 0.12
Nodes (4): client(), prepare_state(), FakeTask, test_health_when_polling_stops()

### Community 56 - "with"
Cohesion: 0.16
Nodes (19): steps, steps, steps, steps, steps, steps, id, run (+11 more)

### Community 57 - "color_test.go"
Cohesion: 0.23
Nodes (15): pickAcc(), TestDefaultAccessoryAssignedOnJoin(), TestMultiplePlayersCanShareSameAccessory(), TestPickAccessoryOutsideLobbyIsIgnored(), TestPickUnknownAccessoryIsIgnored(), TestPickValidAccessory(), lobbyRoom(), pick() (+7 more)

### Community 58 - "Hud.tsx"
Cohesion: 0.20
Nodes (15): GameState, meetingMarker(), ACTION_SLOT, ActionSlot(), Hud(), Minimap(), PlayerCard(), ReservoirPanel() (+7 more)

### Community 60 - "environment"
Cohesion: 0.12
Nodes (16): MATCH_GRPC_ADDR, PLAYERS_GRPC_ADDR, PORT, TRUST_PROXY, environment, image, ports, restart (+8 more)

### Community 61 - "Access.tsx"
Cohesion: 0.25
Nodes (14): charCount(), PASSWORD_MIN_LEN, passwordMissing(), USERNAME_MAX_LEN, USERNAME_MIN_LEN, UsernameProblem, Access(), accessError() (+6 more)

### Community 62 - "DirectionInput"
Cohesion: 0.22
Nodes (9): Axis, Direction, DirectionInput, directionOf(), isMovementKey(), isTyping(), KEY_DIRECTIONS, sign() (+1 more)

### Community 63 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 64 - "players.ts"
Cohesion: 0.28
Nodes (13): bodyOf(), drawBodyFx(), drawPlayer(), PLAYER_H, PLAYER_W, drawPosedSprite(), spriteImageOrFront(), dot() (+5 more)

### Community 65 - "minigameDraw.ts"
Cohesion: 0.17
Nodes (10): FLOURISH_MS, BUCKETS_HERO_X, warmBannerFont(), PARTICLES_HERO_X, BOARD_SCALE, HERO_FEET_Y, Scene, VALVE_HERO_X (+2 more)

### Community 66 - "sync.Mutex"
Cohesion: 0.18
Nodes (7): fakePublisher, fakeStore, MatchStore, ParticipantResult, PlayerInfo, countRole(), fakeStore

### Community 67 - "PoolChecker"
Cohesion: 0.18
Nodes (9): DefaultChecker, mockChecker, Pingable, PoolChecker, extractHostPort(), NewPoolChecker(), pingTCP(), TestDefaultChecker_MissingEnv() (+1 more)

### Community 68 - "Interact"
Cohesion: 0.14
Nodes (3): Interact, ClientAction_Interact, isInteract_Target

### Community 69 - "AMQPPublisher"
Cohesion: 0.25
Nodes (4): newPublisher(), AMQPPublisher, NewAMQPPublisher(), TestPublishWithoutRabbitReturnsNotConnected()

### Community 70 - "jobs"
Cohesion: 0.14
Nodes (13): if, needs, runs-on, timeout-minutes, concurrency, cancel-in-progress, group, jobs (+5 more)

### Community 73 - "Vote"
Cohesion: 0.15
Nodes (3): ClientAction_Vote, isVote_Choice, Vote

### Community 74 - "workPose.ts"
Cohesion: 0.25
Nodes (12): Activity, amplifyPose(), crankPose(), hammerPose(), hopPose(), IDLE_POSE, mixPose(), pourPose() (+4 more)

### Community 75 - "environment"
Cohesion: 0.15
Nodes (12): GATEWAY_HEALTH_URL, MATCH_HEALTH_URL, PLAYERS_HEALTH_URL, RABBITMQ_URL, WEB_HEALTH_URL, environment, image, ports (+4 more)

### Community 76 - "match-db"
Cohesion: 0.18
Nodes (13): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, environment, image, ports, volumes, environment (+5 more)

### Community 77 - "main.rs"
Cohesion: 0.18
Nodes (6): DB_MAX_CONNECTIONS, GRPC_PORT_DEFAULT, HTTP_PORT_DEFAULT, main(), read_port(), shutdown_signal()

### Community 78 - "nearStation"
Cohesion: 0.23
Nodes (3): nearStation(), pickRandomStations(), Station

### Community 79 - "tasks_test.go"
Cohesion: 0.31
Nodes (10): lastSnapshot(), playingRoomTasks(), TestCrewTaskSuccess(), TestImpostorTaskIgnored(), TestMovingAwayCancelsTheTask(), TestSnapshotListsMyTasksAndMarksDone(), TestSnapshotNeverCarriesOtherPlayersTasks(), TestTaskDifferentStationRejected() (+2 more)

### Community 80 - "particlesScene.ts"
Cohesion: 0.17
Nodes (12): WIND, Bit, BLOB_COLORS, BLOB_ROWS, easeOut(), HAND, INTAKE, LAMPS (+4 more)

### Community 81 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module, outDir, rootDir, skipLibCheck (+3 more)

### Community 82 - "hero.ts"
Cohesion: 0.27
Nodes (10): cache, SPRITE_COLORS, SPRITE_H, SPRITE_W, spriteFile(), SpriteFrame, spriteImage(), Face (+2 more)

### Community 83 - "A-dia"
Cohesion: 0.18
Nodes (11): A-dia, accesorio-elegido, muestra-color-elegida, h, pad, state, w, h (+3 more)

### Community 85 - "sql"
Cohesion: 0.18
Nodes (10): go, out, package, sql_package, sql, engine, gen, queries (+2 more)

### Community 89 - "make_message_handler"
Cohesion: 0.22
Nodes (5): make_message_handler(), FakeMessage, test_consumer_retries_until_rabbitmq_is_up(), test_handler_applies_event_before_ack(), test_handler_rejects_invalid_json()

### Community 90 - "Hero"
Cohesion: 0.20
Nodes (5): SpriteBox, lerpPose(), Pose, POSE_UNIT, Hero

### Community 91 - "flood-ws.mjs"
Cohesion: 0.22
Nodes (7): args, avisos, startFlood(), stopFlood(), total, windowMs, ws

### Community 92 - "monitor"
Cohesion: 0.20
Nodes (10): run, monitor, defaults, defaults, if, needs, runs-on, timeout-minutes (+2 more)

### Community 97 - "assets.ts"
Cohesion: 0.27
Nodes (9): AtlasJson, Frame, load(), loadImage(), loadJson(), loadMapAssets(), MAP_ASSETS_URL, Prop (+1 more)

### Community 98 - "LogEntry"
Cohesion: 0.31
Nodes (4): EventLogWriter, WithEventLog(), EventLog, LogEntry

### Community 99 - "services"
Cohesion: 0.22
Nodes (8): name, services, web, volumes, match-db-data, players-db-data, ports, restart

### Community 100 - "match"
Cohesion: 0.22
Nodes (9): match-db, rabbitmq, condition, depends_on, ports, restart, depends_on, condition (+1 more)

### Community 101 - "outputs"
Cohesion: 0.22
Nodes (9): outputs, runs-on, timeout-minutes, changes, compose, match, monitor, node (+1 more)

### Community 103 - "progress.rs"
Cohesion: 0.36
Nodes (6): status_from_profile(), get_profile(), PlayerProfile, ProfileError, Database, NotFound

### Community 104 - "activityFx.ts"
Cohesion: 0.42
Nodes (8): drawActivity(), drawFilter(), drawFixLeak(), drawPourBucket(), drawRepair(), drawTankWork(), phaseOf(), renderActivities()

### Community 105 - "environment"
Cohesion: 0.25
Nodes (8): GATEWAY_HEALTH_URL, MATCH_HEALTH_URL, PLAYERS_HEALTH_URL, WEB_HEALTH_URL, environment, ports, restart, monitor

### Community 106 - "environment"
Cohesion: 0.29
Nodes (8): HTTP_PORT, MAP_PATH, MATCH_DB_URL, PLAYERS_DB_URL, RABBITMQ_URL, RECONNECT_GRACE_SECONDS, environment, environment

### Community 107 - "healthcheck"
Cohesion: 0.46
Nodes (8): interval, retries, start_period, test, timeout, healthcheck, healthcheck, healthcheck

### Community 108 - "Stage.tsx"
Cohesion: 0.46
Nodes (5): HudLayer(), useScale(), STAGE_H, STAGE_W, stageScale()

### Community 109 - "context"
Cohesion: 0.48
Nodes (7): context, dockerfile, build, build, build, build, build

### Community 110 - "gateway"
Cohesion: 0.29
Nodes (7): MATCH_GRPC_ADDR, PLAYERS_GRPC_ADDR, PORT, environment, ports, restart, gateway

### Community 111 - "rabbitmq"
Cohesion: 0.29
Nodes (7): RABBITMQ_DEFAULT_PASS, RABBITMQ_DEFAULT_USER, entrypoint, environment, image, ports, rabbitmq

### Community 112 - "hud-alerta"
Cohesion: 0.48
Nodes (7): hud-alerta, h, margen, w, x, y, hud-alerta

### Community 113 - "hud-laguna"
Cohesion: 0.48
Nodes (7): hud-laguna, h, margen, w, x, y, hud-laguna

### Community 114 - "hud-minimapa"
Cohesion: 0.48
Nodes (7): hud-minimapa, h, margen, w, x, y, hud-minimapa

### Community 115 - "hud-rol-cubeta"
Cohesion: 0.48
Nodes (7): hud-rol-cubeta, h, margen, w, x, y, hud-rol-cubeta

### Community 116 - "hud-tareas"
Cohesion: 0.48
Nodes (7): hud-tareas, h, margen, w, x, y, hud-tareas

### Community 117 - "boton-def-active"
Cohesion: 0.48
Nodes (7): boton-def-active, boton-def-active, h, nueve_cortes_px, pad, state, w

### Community 118 - "boton-def-disabled"
Cohesion: 0.48
Nodes (7): boton-def-disabled, boton-def-disabled, h, nueve_cortes_px, pad, state, w

### Community 119 - "boton-def-hover"
Cohesion: 0.48
Nodes (7): boton-def-hover, boton-def-hover, h, nueve_cortes_px, pad, state, w

### Community 120 - "boton-def-normal"
Cohesion: 0.48
Nodes (7): boton-def-normal, boton-def-normal, h, nueve_cortes_px, pad, state, w

### Community 121 - "boton-pri-active"
Cohesion: 0.48
Nodes (7): boton-pri-active, boton-pri-active, h, nueve_cortes_px, pad, state, w

### Community 122 - "boton-pri-disabled"
Cohesion: 0.48
Nodes (7): boton-pri-disabled, boton-pri-disabled, h, nueve_cortes_px, pad, state, w

### Community 123 - "boton-pri-hover"
Cohesion: 0.48
Nodes (7): boton-pri-hover, boton-pri-hover, h, nueve_cortes_px, pad, state, w

### Community 124 - "boton-pri-normal"
Cohesion: 0.48
Nodes (7): boton-pri-normal, boton-pri-normal, h, nueve_cortes_px, pad, state, w

### Community 125 - "boton-sec-normal"
Cohesion: 0.43
Nodes (7): boton-sec-normal, boton-sec-normal, h, nueve_cortes_px, pad, state, w

### Community 126 - "messages/package.json"
Cohesion: 0.29
Nodes (6): description, main, name, private, types, version

### Community 129 - "players"
Cohesion: 0.33
Nodes (6): players-db, condition, depends_on, ports, restart, players

### Community 130 - "hud-accion-chat"
Cohesion: 0.33
Nodes (6): hud-accion-chat, h, margen, w, x, y

### Community 131 - "hud-accion-reportar"
Cohesion: 0.33
Nodes (6): hud-accion-reportar, h, margen, w, x, y

### Community 132 - "hud-accion-usar"
Cohesion: 0.33
Nodes (6): hud-accion-usar, h, margen, w, x, y

### Community 133 - "hud-acciones"
Cohesion: 0.33
Nodes (6): hud-acciones, h, margen, w, x, y

### Community 134 - "hud-etiqueta-jugador"
Cohesion: 0.33
Nodes (6): hud-etiqueta-jugador, h, margen, w, x, y

### Community 135 - "hud-etiqueta-propia"
Cohesion: 0.33
Nodes (6): hud-etiqueta-propia, h, margen, w, x, y

### Community 136 - "hud-tecla"
Cohesion: 0.33
Nodes (6): hud-tecla, h, margen, w, x, y

### Community 137 - "boton-amber-active"
Cohesion: 0.33
Nodes (6): boton-amber-active, h, nueve_cortes_px, pad, state, w

### Community 138 - "boton-amber-disabled"
Cohesion: 0.33
Nodes (6): boton-amber-disabled, h, nueve_cortes_px, pad, state, w

### Community 139 - "boton-amber-hover"
Cohesion: 0.33
Nodes (6): boton-amber-hover, h, nueve_cortes_px, pad, state, w

### Community 140 - "boton-amber-normal"
Cohesion: 0.33
Nodes (6): boton-amber-normal, h, nueve_cortes_px, pad, state, w

### Community 141 - "boton-dan-active"
Cohesion: 0.33
Nodes (6): boton-dan-active, h, nueve_cortes_px, pad, state, w

### Community 142 - "boton-dan-disabled"
Cohesion: 0.33
Nodes (6): boton-dan-disabled, h, nueve_cortes_px, pad, state, w

### Community 143 - "boton-dan-hover"
Cohesion: 0.33
Nodes (6): boton-dan-hover, h, nueve_cortes_px, pad, state, w

### Community 144 - "boton-dan-normal"
Cohesion: 0.33
Nodes (6): boton-dan-normal, h, nueve_cortes_px, pad, state, w

### Community 145 - "boton-sec-active"
Cohesion: 0.33
Nodes (6): boton-sec-active, h, nueve_cortes_px, pad, state, w

### Community 146 - "boton-sec-disabled"
Cohesion: 0.33
Nodes (6): boton-sec-disabled, h, nueve_cortes_px, pad, state, w

### Community 147 - "boton-sec-hover"
Cohesion: 0.33
Nodes (6): boton-sec-hover, h, nueve_cortes_px, pad, state, w

### Community 148 - "campo-foco"
Cohesion: 0.33
Nodes (6): campo-foco, h, nueve_cortes_px, pad, state, w

### Community 149 - "campo-normal"
Cohesion: 0.33
Nodes (6): campo-normal, h, nueve_cortes_px, pad, state, w

### Community 150 - "codigo-sala"
Cohesion: 0.33
Nodes (6): codigo-sala, h, nueve_cortes_px, pad, state, w

### Community 151 - "deslizador-0"
Cohesion: 0.33
Nodes (6): deslizador-0, h, nueve_cortes_px, pad, state, w

### Community 152 - "deslizador-100"
Cohesion: 0.33
Nodes (6): deslizador-100, h, nueve_cortes_px, pad, state, w

### Community 153 - "deslizador-50"
Cohesion: 0.33
Nodes (6): deslizador-50, h, nueve_cortes_px, pad, state, w

### Community 154 - "fila-tabla"
Cohesion: 0.33
Nodes (6): fila-tabla, h, nueve_cortes_px, pad, state, w

### Community 155 - "fila-tabla-activa"
Cohesion: 0.33
Nodes (6): fila-tabla-activa, h, nueve_cortes_px, pad, state, w

### Community 156 - "jugador-ranura"
Cohesion: 0.33
Nodes (6): jugador-ranura, h, nueve_cortes_px, pad, state, w

### Community 157 - "jugador-ranura-propia"
Cohesion: 0.33
Nodes (6): jugador-ranura-propia, h, nueve_cortes_px, pad, state, w

### Community 158 - "jugador-ranura-vacia"
Cohesion: 0.33
Nodes (6): jugador-ranura-vacia, h, nueve_cortes_px, pad, state, w

### Community 159 - "marco-imagen"
Cohesion: 0.33
Nodes (6): marco-imagen, h, nueve_cortes_px, pad, state, w

### Community 160 - "medidor-agua-0"
Cohesion: 0.33
Nodes (6): medidor-agua-0, h, nueve_cortes_px, pad, state, w

### Community 161 - "medidor-agua-100"
Cohesion: 0.33
Nodes (6): medidor-agua-100, h, nueve_cortes_px, pad, state, w

### Community 162 - "medidor-agua-50"
Cohesion: 0.33
Nodes (6): medidor-agua-50, h, nueve_cortes_px, pad, state, w

### Community 163 - "medidor-amber-0"
Cohesion: 0.33
Nodes (6): medidor-amber-0, h, nueve_cortes_px, pad, state, w

### Community 164 - "medidor-amber-100"
Cohesion: 0.33
Nodes (6): medidor-amber-100, h, nueve_cortes_px, pad, state, w

### Community 165 - "medidor-amber-50"
Cohesion: 0.33
Nodes (6): medidor-amber-50, h, nueve_cortes_px, pad, state, w

### Community 166 - "medidor-bad-0"
Cohesion: 0.33
Nodes (6): medidor-bad-0, h, nueve_cortes_px, pad, state, w

### Community 167 - "medidor-bad-100"
Cohesion: 0.33
Nodes (6): medidor-bad-100, h, nueve_cortes_px, pad, state, w

### Community 168 - "medidor-bad-50"
Cohesion: 0.33
Nodes (6): medidor-bad-50, h, nueve_cortes_px, pad, state, w

### Community 169 - "medidor-leaf-0"
Cohesion: 0.33
Nodes (6): medidor-leaf-0, h, nueve_cortes_px, pad, state, w

### Community 170 - "medidor-leaf-100"
Cohesion: 0.33
Nodes (6): medidor-leaf-100, h, nueve_cortes_px, pad, state, w

### Community 171 - "medidor-leaf-50"
Cohesion: 0.33
Nodes (6): medidor-leaf-50, h, nueve_cortes_px, pad, state, w

### Community 172 - "opcion-activa"
Cohesion: 0.33
Nodes (6): opcion-activa, h, nueve_cortes_px, pad, state, w

### Community 173 - "opcion-normal"
Cohesion: 0.33
Nodes (6): opcion-normal, h, nueve_cortes_px, pad, state, w

### Community 174 - "panel-claro"
Cohesion: 0.33
Nodes (6): panel-claro, h, nueve_cortes_px, pad, state, w

### Community 175 - "panel-madera"
Cohesion: 0.33
Nodes (6): panel-madera, h, nueve_cortes_px, pad, state, w

### Community 176 - "panel-oscuro"
Cohesion: 0.33
Nodes (6): panel-oscuro, h, nueve_cortes_px, pad, state, w

### Community 177 - "pildora"
Cohesion: 0.33
Nodes (6): pildora, h, nueve_cortes_px, pad, state, w

### Community 178 - "pozo"
Cohesion: 0.33
Nodes (6): pozo, h, nueve_cortes_px, pad, state, w

### Community 179 - "pozo-oscuro"
Cohesion: 0.33
Nodes (6): pozo-oscuro, h, nueve_cortes_px, pad, state, w

### Community 180 - "tablon"
Cohesion: 0.33
Nodes (6): tablon, h, nueve_cortes_px, pad, state, w

### Community 181 - "tarjeta-activa"
Cohesion: 0.33
Nodes (6): tarjeta-activa, h, nueve_cortes_px, pad, state, w

### Community 182 - "tarjeta-normal"
Cohesion: 0.33
Nodes (6): tarjeta-normal, h, nueve_cortes_px, pad, state, w

### Community 183 - "env"
Cohesion: 0.33
Nodes (6): CONTRACTS, MATCH, MONITOR, NODE, PLAYERS, env

### Community 185 - "accesorio-normal"
Cohesion: 0.40
Nodes (5): accesorio-normal, h, pad, state, w

### Community 186 - "boton-pri-pequeno-normal"
Cohesion: 0.40
Nodes (5): boton-pri-pequeno-normal, h, pad, state, w

### Community 187 - "boton-sec-pequeno-normal"
Cohesion: 0.40
Nodes (5): boton-sec-pequeno-normal, h, pad, state, w

### Community 188 - "chip-bad"
Cohesion: 0.40
Nodes (5): chip-bad, h, pad, state, w

### Community 189 - "chip-grande-bad"
Cohesion: 0.40
Nodes (5): chip-grande-bad, h, pad, state, w

### Community 190 - "chip-grande-info"
Cohesion: 0.40
Nodes (5): chip-grande-info, h, pad, state, w

### Community 191 - "chip-grande-neutro"
Cohesion: 0.40
Nodes (5): chip-grande-neutro, h, pad, state, w

### Community 192 - "chip-grande-ok"
Cohesion: 0.40
Nodes (5): chip-grande-ok, h, pad, state, w

### Community 193 - "chip-grande-warn"
Cohesion: 0.40
Nodes (5): chip-grande-warn, h, pad, state, w

### Community 194 - "chip-info"
Cohesion: 0.40
Nodes (5): chip-info, h, pad, state, w

### Community 195 - "chip-neutro"
Cohesion: 0.40
Nodes (5): chip-neutro, h, pad, state, w

### Community 196 - "chip-ok"
Cohesion: 0.40
Nodes (5): chip-ok, h, pad, state, w

### Community 197 - "chip-warn"
Cohesion: 0.40
Nodes (5): chip-warn, h, pad, state, w

### Community 198 - "interruptor-apagado"
Cohesion: 0.40
Nodes (5): interruptor-apagado, h, pad, state, w

### Community 199 - "interruptor-encendido"
Cohesion: 0.40
Nodes (5): interruptor-encendido, h, pad, state, w

### Community 200 - "muestra-color-normal"
Cohesion: 0.40
Nodes (5): muestra-color-normal, h, pad, state, w

### Community 201 - "pestana-activa"
Cohesion: 0.40
Nodes (5): pestana-activa, h, pad, state, w

### Community 202 - "pestana-normal"
Cohesion: 0.40
Nodes (5): pestana-normal, h, pad, state, w

### Community 203 - "punto-estado"
Cohesion: 0.40
Nodes (5): punto-estado, h, pad, state, w

### Community 204 - "selector-segmentado"
Cohesion: 0.40
Nodes (5): selector-segmentado, h, pad, state, w

### Community 205 - "tecla"
Cohesion: 0.40
Nodes (5): tecla, h, pad, state, w

### Community 206 - "match"
Cohesion: 0.40
Nodes (5): match, if, needs, runs-on, timeout-minutes

### Community 207 - "node"
Cohesion: 0.40
Nodes (5): node, if, needs, runs-on, timeout-minutes

### Community 208 - "players"
Cohesion: 0.40
Nodes (5): players, if, needs, runs-on, timeout-minutes

### Community 210 - "eco"
Cohesion: 0.50
Nodes (3): A-dia, eco, planta2

### Community 211 - "True"
Cohesion: 0.50
Nodes (4): branches, True, pull_request, push

### Community 212 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, workspaces

### Community 213 - "eco"
Cohesion: 0.67
Nodes (3): B-noche, eco, planta2

## Knowledge Gaps
- **15 isolated node(s):** `player`, `Database`, `NotFound`, `github.com/notoriussss/in-filtrados/match`, `monitor` (+10 more)
  These have â‰¤1 connection - possible missing edges. (Counts symbols only; 1246 node(s) total have â‰¤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** â€” run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Room` connect `Room` to `match.pb.go`, `setupServer`, `LogEntry`, `sync.Mutex`, `testing.T`, `Meeting`, `options.go`, `Snapshot`, `events.go`, `Map`, `nearStation`, `ServerEvent`, `.canWorkOn`, `ChatMessage`, `.pickAccessory`, `file_match_proto_rawDescGZIP`, `context.Context`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `player`, `Database`, `NotFound` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lobby.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06708494208494209 - nodes in this community are weakly interconnected._
- **Why does `A-dia` connect `A-dia` to `boton-def-active`, `boton-def-disabled`, `boton-def-hover`, `boton-def-normal`, `boton-pri-active`, `boton-pri-disabled`, `boton-pri-hover`, `boton-pri-normal`, `boton-sec-normal`, `boton-amber-active`, `boton-amber-disabled`, `boton-amber-hover`, `boton-amber-normal`, `boton-dan-active`, `boton-dan-disabled`, `boton-dan-hover`, `boton-dan-normal`, `boton-sec-active`, `boton-sec-disabled`, `boton-sec-hover`, `campo-foco`, `campo-normal`, `codigo-sala`, `deslizador-0`, `deslizador-100`, `deslizador-50`, `fila-tabla`, `fila-tabla-activa`, `jugador-ranura`, `jugador-ranura-propia`, `jugador-ranura-vacia`, `marco-imagen`, `medidor-agua-0`, `medidor-agua-100`, `medidor-agua-50`, `medidor-amber-0`, `medidor-amber-100`, `medidor-amber-50`, `medidor-bad-0`, `medidor-bad-100`, `medidor-bad-50`, `medidor-leaf-0`, `medidor-leaf-100`, `medidor-leaf-50`, `opcion-activa`, `opcion-normal`, `panel-claro`, `panel-madera`, `panel-oscuro`, `pildora`, `pozo`, `pozo-oscuro`, `tablon`, `tarjeta-activa`, `tarjeta-normal`, `accesorio-normal`, `boton-pri-pequeno-normal`, `boton-sec-pequeno-normal`, `chip-bad`, `chip-grande-bad`, `chip-grande-info`, `chip-grande-neutro`, `chip-grande-ok`, `chip-grande-warn`, `chip-info`, `chip-neutro`, `chip-ok`, `chip-warn`, `interruptor-apagado`, `interruptor-encendido`, `muestra-color-normal`, `pestana-activa`, `pestana-normal`, `punto-estado`, `selector-segmentado`, `tecla`, `B-noche`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Room` be split into smaller, more focused modules?**
  _Cohesion score 0.04336468129571578 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `world.ts` to `Lobby.tsx`, `Meeting.tsx`, `game/session.ts`, `playerAnim.ts`, `minigames.ts`, `workPose.ts`, `Stage.tsx`, `map.ts`, `Settings.tsx`, `socket.ts`, `web/package.json`, `Access.tsx`, `DirectionInput`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Should `match.pb.go` be split into smaller, more focused modules?**
  _Cohesion score 0.14585414585414586 - nodes in this community are weakly interconnected._
