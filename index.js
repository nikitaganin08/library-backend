const { ApolloServer, gql, UserInputError } = require('apollo-server')
const uuid = require('uuid/v1')
const { connect } = require('mongoose')
const Books = require('./models/Books')
const Author = require('./models/Author')

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
    type Query {
        bookCount: Int!
        authorCount: Int!
        allBooks(author: String, genre: String): [Book!]!
        allAuthors: [Author!]!
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
    }
`

const resolvers = {
    Query: {
        bookCount: async () => await Books.collection.countDocuments(),
        authorCount: async () => await Author.collection.countDocuments(),
        allBooks: async (root, args) => {
            if (!args.author && !args.genre) {
                return Books.find({})
            }
            return Books.find({
                genres: { $in: [args.genre] }
            })
        },
        allAuthors: async () => await Author.find({})
    },
    Author: {
        bookCount: async (root) => {
            return Books.find({}).populate({
                path: 'author',
                match: { name: root.name }
            }).count()
        }
    },
    Mutation: {
        addBook: async (root, args) => {
            let author = await Author.findOne({ name: args.author })
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
                return await book.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args
                })
            }
        },
        editAuthor: async (root, args) => {
            const author = await Author.findOne({ name: args.name })
            if (!author) {
                return null
            }
            author.born = args.setBornTo
            return author.save()
        }
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
})

server.listen().then(({ url }) => {
    console.log(`Server ready at ${url}`)
})