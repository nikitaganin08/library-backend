const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server')
const uuid = require('uuid/v1')
const { connect } = require('mongoose')
const Books = require('./models/Books')
const Author = require('./models/Author')
const User = require('./models/User')
const jwt = require('jsonwebtoken')

const { PubSub } = require('apollo-server')
const pubsub = new PubSub()

const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'
const MONGODB_URI = 'mongodb+srv://fullstackopen:fullstackopen@cluster0.qoqeu.mongodb.net/myFirstDatabase?retryWrites=true&w=majority'

console.log('connecting to', MONGODB_URI)

connect(MONGODB_URI)
    .then(() => {
        console.log('connected to MongoDB')
    })
    .catch((error) => {
        console.log('error connection to MongoDB:', error.message)
    })


const typeDefs = gql`
    type Book {
        id: ID!
        title: String!
        published: Int!
        author: Author!
        genres: [String!]!

    }
    type Author {
        id: ID!
        name: String!
        born: Int
        bookCount: Int!
    }
    type User {
        username: String!,
        favouriteGenre: String!,
        id: ID!
    }
    type Token {
        value: String!
    }
    type Query {
        bookCount: Int!
        authorCount: Int!
        allBooks(author: String, genre: String): [Book!]!
        allAuthors: [Author!]!
        me: User
    }
    type Mutation {
        addBook(
            title: String!
            published: Int!
            author: String!
            genres: [String!]!
        ): Book
        editAuthor(
            name: String!
            setBornTo: Int!
        ): Author
        createUser(
            username: String!,
            favouriteGenre: String!
        ): User
        login(
            username: String!,
            password: String!,
        ): Token
    }
    type Subscription {
        bookAdded: Book!
    }
`

const resolvers = {
    Query: {
        bookCount: async () => await Books.collection.countDocuments(),
        authorCount: async () => await Author.collection.countDocuments(),
        allBooks: async (root, args) => {
            if (!args.author && !args.genre) {
                return Books.find({})
                    .populate('author')
            }
            return Books.find({
                genres: { $in: [args.genre] }
            }).populate('author')
        },
        allAuthors: async () => await Author.find({}),
        me: async (root, args, context) => {
            return context.currentUser
        }
    },
    Author: {
        bookCount: async (root) => {
            return Books.find({}).populate({
                path: 'author',
                match: { 'name': root.name }
            }).count()
        }
    },
    Mutation: {
        addBook: async (root, args, context) => {
            let author = await Author.findOne({ name: args.author })
            const currentUser = context.currentUser
            if (!currentUser) {
                throw new AuthenticationError('not authenticated')
            }

            if (!author) {
                const newAuthor = new Author({ name: args.author, id: uuid() })
                try {
                    author = await newAuthor.save()
                } catch (error) {
                    throw new UserInputError(error.message, {
                        invalidArgs: args
                    })
                }
            }
            const book = new Books({ ...args, author: author, id: uuid() })
            try {
                await book.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args
                })
            }
            await pubsub.publish('BOOK_ADDED', { bookAdded: book })
            return book
        },
        editAuthor: async (root, args, context) => {
            const currentUser = context.currentUser
            if (!currentUser) {
                throw new AuthenticationError('not authenticated')
            }

            const author = await Author.findOne({ name: args.name })
            if (!author) {
                return null
            }
            author.born = args.setBornTo
            return author.save()
        },
        createUser: async (root, args) => {
            const user = new User({
                username: args.username,
                favouriteGenre: args.favouriteGenre
            })

            return user.save().catch(error => {
                throw new UserInputError(error.message, {
                    invalidArgs: args
                })
            })
        },
        login: async (root, args) => {
            const user = await User.findOne({ username: args.username })
            if (!user || args.password !== 'secret') {
                throw new UserInputError('wrong credentials')
            }

            const userForToken = {
                username: user.username,
                id: user._id
            }
            return { value: jwt.sign(userForToken, JWT_SECRET) }
        },
    },
    Subscription: {
        bookAdded: {
            subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
        },
    },
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.toLowerCase().startsWith('bearer ')) {
            const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET)
            const currentUser = User.findById(decodedToken.id)
            return { currentUser }
        }
    }
})

server.listen().then(({ url, subscriptionsUrl }) => {
    console.log(`Server ready at ${url}`)
    console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})