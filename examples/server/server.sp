const { use, get, post, send, json, listen } = Server

const port = 3000

const app = Server.new()

app->use(Server.encodings.urlencoded({extended: true}))
app->use(Server.encodings.json())

app->get("/", (req, res) => {
    print("Visited: /")
    res->send(`<h1 onclick="console.log('hello')"> Hello World </h1>`)
})

app->get("/users/:id", (req, res) => {
    const id = (req->value).params.id
    print(`Visited: /users/{{id}}`)
    fetch("https://jsonplaceholder.typicode.com/todos/" + id, (data) => {
        if (!data) {
            res->json({error: {code: 404, message: `ID {{id}} not found`}})
        } else {
            res->json(data)
        }
    })
})

app->post("/data", (req, res) => {
    const body = (req->value).body
    res->send({
        keys: body->keys, 
        values: (body->inspect).values,
        length: body->length
    })
})

app->listen(port, 
    () => print(`Listening on port {{port}}...`)
)