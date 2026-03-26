
🏠 『脱・ホームレス：サバイバルシティ』 開発仕様書
1. プロジェクト概要
本作は、ブラウザ上で動作するマルチプレイヤー対応のボードゲームです。プレイヤーは限られたAP（行動力）を駆使し、ゴミ漁り、バイト、陣地占領、他プレイヤーへの妨害などを行いながら、指定ラウンド数終了時における総資産（ポイント＋陣地価値＋資源）の最大化を目指します。

アーキテクチャ: クライアントサイド完結型（サーバーレス）

通信方式: PeerJSによるP2P通信 ＋ Firebase Realtime Databaseによるロビーマッチング

依存ライブラリ: PeerJS (v1.5.2), Firebase SDK (v10.8.1 compat)

2. ファイル構成と役割（基本分割モジュール）
モノリシックなHTMLから、役割ごとに以下の構成へ分割・整理されています。

index.html: アプリケーションのエントリポイント。UIの骨組み（DOM）、グローバル変数（状態管理）、初期化処理を担う。各JSファイルを決められた順序で読み込む。

style.css: UIのスタイリング。クレイモーフィズム風のCSS変数、レスポンシブ対応、天候による背景変化などのスタイルを定義。

data.js: 変更されないマスタデータ（定数）。キャラクター情報、カードデッキ（deckData）、マップ生成関数（Small/Medium/Large）を格納。

ui.js: 画面の描画更新や演出。DOM操作による各種パネルの更新、ポップアップの表示、Web Audio APIによる自前オシレーターでの効果音生成（playSfx）を担当。

game.js: ゲームのコアルール。ダイスロール、移動、ダメージ計算（dealDamage）、各種アクション（ゴミ漁り、アイテム使用など）、ラウンド終了処理、NPCの移動、CPUのAI（processCPUTurn）を管理。

network.js: オンラインマルチプレイ制御。Firebaseを用いた部屋一覧の取得・作成、PeerJSを用いたホスト・ゲスト間のP2P接続確立、およびゲーム状態（GameState）の同期処理を担当。

3. 主要なデータ構造（State Management）
ゲームの進行状態は index.html 内のグローバル変数として保持され、オンライン時はホストを正として全クライアントに同期されます。

👥 プレイヤーデータ (players 配列)
各プレイヤーは以下のプロパティを持つオブジェクトとして管理されます。

id / name / isCPU / userId: 基本情報

charType: キャラクタークラス（athlete, sales, survivor, yankee）

pos: 現在のマスID

hp (Max 100) / p (ポイント・資金) / ap (行動力)

hand (配列) / maxHand: 所持カードIDと上限

cans / trash: 収集した資源

equip: 永続・使い切り装備のフラグ群（bicycle, shoes, cart, shield, helmet, doll, backpack）

その他バフ・デバフ状態（stealth, rainGear, bonusAP, penaltyAP 等）

🗺️ マップと環境データ
mapData: 盤面の構成配列。各マスは id, col, row, next (隣接マスの配列), area (スラム/商業/高級), type (通常/缶/ゴミ/イベント等) を持つ。

territories: 陣地の所有状況（Key: マスID, Value: プレイヤーID）。

weatherState / isNight: 天候（移動コスト等に影響）と昼夜のフラグ。

canPrice / trashPrice: ラウンド毎に変動する換金相場。

truckPos / policePos 等: 各NPCの現在位置マスID。

4. マスタデータ定義 (data.js)
🃏 カードデッキ (deckData)
カードはオブジェクトの配列として定義され、以下の属性を持ちます。

id: ユニーク識別子

name / icon / desc: UI表示用データ

type: action (即時効果), equip (装備品), weapon (攻撃用) のいずれか

（Weaponのみ）range: 射程, dmg: ダメージ量, aoe: 範囲攻撃フラグ

5. ゲームループと主要ロジック (game.js)
ターンの開始: プレイヤーはサイコロを振り（rollDice）、出目とバフ/デバフに応じたAPを獲得。陣地収入と目的地ボーナスの判定を行う。

アクションの実行: プレイヤーはAPを消費して以下の行動を行う（順不同・回数制限内）。

actionMove(): 1AP（雨天時2AP）消費して隣接マスへ移動。マス到着時のイベント（NPC遭遇、目的地到達、イベントマス判定）を処理。

マス固有アクション: 缶拾い（1AP）、ゴミ漁り（1〜2AP）、バイト（4AP）など。

カード使用（useCard）: 2APを消費し、手札の効果を発動。

ターンの終了 (endTurnLogic): APが0になるか、任意でターンを終了。次のプレイヤーへ移行。

ラウンドの終了 (processRoundEvents): 全員のターンが終わると発生。天候・相場の変動、収集車の暴走（全体ダメージ判定）、警察のパトロール（偶数ラウンド）を処理し、指定ラウンド（10/20/30）に達すれば endGame() を呼び出す。

6. 通信アーキテクチャ (network.js)
P2Pモデルを採用しており、ロビー用サーバーと実プレイ用通信を分離しています。

マッチング (Firebase):
ホストが部屋を作成すると、合言葉をキーとして Firebase RTDB の rooms/ に部屋情報が登録されます。ゲストはFirebaseから部屋一覧を取得し、参加したい部屋の合言葉を得ます。

P2P通信 (PeerJS):
合言葉にプレフィックス（hmlss-）を付けた文字列を PeerJS の ID とし、ホスト・ゲスト間で直接コネクションを確立します。

状態同期 (syncOnline):
アクションが行われる度に window.extractGameState() で現在のグローバル変数をJSON化し、ネットワークへブロードキャストします。受信側は window.applyGameState() で自身の画面へ反映させます（UIアニメーション中は同期を保留する保護機能あり）。

7. UIと演出 (ui.js)
DOM操作の最適化: 状態が変わるたびに updateUI() が呼ばれ、画面上のテキストやボタンの有効/無効状態を一括で更新します（手札やプレイヤーリストは innerHTML で再構築）。

サウンド (Web Audio API): playSfx(type) にて、OscillatorNode を用いてサイン波・ノコギリ波などを合成し、アセットのダウンロード不要で効果音を生成します。

非同期UI制御: sleep() 関数と async/await を活用し、サイコロの回転アニメーションや収集車の暴走アニメーション中など、処理を一時停止させて演出の時間を確保しています。