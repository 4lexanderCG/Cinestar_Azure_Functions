const { app } = require('@azure/functions');
const sql = require('mssql');

const sqlConfig = process.env.SqlConnectionString;

async function executeQuery(query, params = []) {
    try {
        await sql.connect(sqlConfig);
        const request = new sql.Request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.query(query);
        return { status: 200, jsonBody: result.recordset };
    } catch (err) {
        return { status: 500, jsonBody: { error: "Hubo un error al consultar la base de datos.", detalle: err.message } };
    }
}

async function executeProcedure(procedure, params = []) {
    try {
        await sql.connect(sqlConfig);
        const request = new sql.Request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.execute(procedure);
        return result.recordset;
    } catch (err) {
        throw err;
    }
}

function formatFecha(fechaStr) {
    if (!fechaStr) return "";
    const parts = fechaStr.trim().split('/');
    if (parts.length !== 3) return fechaStr;
    const date = new Date(parts[2], parseInt(parts[1]) - 1, parseInt(parts[0]));
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[date.getDay()]} ${parseInt(parts[0])} de ${meses[date.getMonth()]} del ${parts[2]}`;
}

function processMovies(response) {
    if (response.status === 200 && Array.isArray(response.jsonBody)) {
        response.jsonBody.forEach(p => {
            if (p.FechaEstreno) p.FechaEstrenoss = formatFecha(p.FechaEstreno);
            if (p.Geneross) p.Geneross = p.Geneross.trim();
            p.idEstado = p.idEstado.toString();
            p.id = p.id.toString();
        });
    }
    return response;
}

app.http('getCines', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'cines',
    handler: async () => {
        const response = await executeQuery(`EXEC sp_getCines`);
        if (response.status === 200 && Array.isArray(response.jsonBody)) {
            response.jsonBody.forEach(c => c.Distrito = c.Detalle);
        }
        return response;
    }
});

app.http('getCineById', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'cine/{id}',
    handler: async (request) => {
        const id = parseInt(request.params.id);       
        try {
            const params = [{ name: 'id', type: sql.Int, value: id }];
            const paramsCine = [{ name: 'idCine', type: sql.Int, value: id }];
            
            const [cineData, tarifas, peliculas] = await Promise.all([
                executeProcedure('sp_getCine', params),
                executeProcedure('sp_getCineTarifas', paramsCine),
                executeProcedure('sp_getCinePeliculas', paramsCine)
            ]);

            if (!cineData || cineData.length === 0) {
                return { status: 404, jsonBody: { error: 'Cine no encontrado' } };
            }

            const cine = cineData[0];
            cine.Distrito = cine.Detalle; 
            cine.tarifas = tarifas || [];
            cine.peliculas = peliculas || [];
            
            return { status: 200, jsonBody: [cine] };
        } catch(err) {
            return { status: 500, jsonBody: { error: "Error al compilar el cine.", detalle: err.message} };
        }
    }
});

app.http('getPeliculas', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'peliculas/{idEstado}',
    handler: async (request) => {
        const response = await executeQuery(
            `SELECT *, dbo.getGenerosDetalle(Generos) as Geneross FROM Pelicula WHERE idEstado = @idEstado`, 
            [{ name: 'idEstado', type: sql.Int, value: parseInt(request.params.idEstado) }]
        );
        return processMovies(response);
    }
});

app.http('getPeliculaById', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'pelicula/{id}',
    handler: async (request) => {
        const response = await executeQuery(
            `EXEC sp_getPelicula @id = @id`, 
            [{ name: 'id', type: sql.Int, value: parseInt(request.params.id) }]
        );
        return processMovies(response);
    }
});
