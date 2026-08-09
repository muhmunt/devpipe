package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"devpipe/be/internal/db"
	"devpipe/be/internal/handlers"
	"devpipe/be/internal/stream"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://devpipe:devpipe@localhost:5432/devpipe?sslmode=disable"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	if err := db.Migrate(dsn); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	pool, err := db.Connect(context.Background(), dsn)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	cardStore := db.NewCardStore(pool)
	prdStore := db.NewPRDStore(pool)
	planStore := db.NewPlanStore(pool)
	taskStore := db.NewTaskStore(pool)
	runStore := db.NewRunStore(pool)
	artifactStore := db.NewArtifactStore(pool)
	chatStore := db.NewChatStore(pool)
	hub := stream.NewHub()

	cardHandler := &handlers.CardHandler{Store: cardStore, Hub: hub}
	agentHandler := &handlers.AgentHandler{}
	prdHandler := &handlers.PRDHandler{Store: prdStore, Cards: cardStore}
	planHandler := &handlers.PlanHandler{Cards: cardStore, PRDs: prdStore, Plans: planStore, Tasks: taskStore, Hub: hub}
	buildHandler := &handlers.BuildHandler{
		Cards: cardStore, Plans: planStore, Tasks: taskStore,
		Runs: runStore, Artifacts: artifactStore, Chats: chatStore, Hub: hub,
	}
	streamHandler := &handlers.StreamHandler{Hub: hub}
	chatHandler := &handlers.ChatHandler{
		Cards: cardStore, PRDs: prdStore, Plans: planStore, Tasks: taskStore, Chats: chatStore, Hub: hub,
	}
	runHandler := &handlers.RunHandler{Runs: runStore, Artifacts: artifactStore}
	pathHandler := &handlers.PathHandler{}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5174"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Route("/api", func(r chi.Router) {
		cardHandler.Routes(r)
		agentHandler.Routes(r)
		prdHandler.Routes(r)
		planHandler.Routes(r)
		buildHandler.Routes(r)
		streamHandler.Routes(r)
		chatHandler.Routes(r)
		runHandler.Routes(r)
		pathHandler.Routes(r)
	})

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
