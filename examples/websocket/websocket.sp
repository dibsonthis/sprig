const {client, on, send, createReadLineInterface} = Websocket
const {parse} = Json

const wsc = client("wss://stream.binance.com:9443/ws/btcusdt@trade")
const rl = createReadLineInterface()

const n = 1000

var price;
var lastPrice;
var secondLastPrice;

const intervalId = interval(() => {
    secondLastPrice = lastPrice
    lastPrice = price
    const diff = (lastPrice - secondLastPrice)->truncate(3)
    
    const diffString = 
        diff > 0 ? `\e[32m${{diff}}\e[0m` : `\e[31m${{diff}}\e[0m`

    print(`Price: {{lastPrice}} ({{diffString}})`)
}, n)

rl->on("line", (data) => {
    wsc->send(data)
})

wsc->on("open", (e) => {
    print("Opening connection")
})

wsc->on("message", (e) => {
    const parsed = parse(e)
    price = (parsed.p)->toNumber
})

wsc->on("close", (e) => {
    print("Closing connection")
    clearInterval(intervalId)
})