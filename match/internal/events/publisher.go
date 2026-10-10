package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// reconnectInterval es lo que se espera entre intentos cuando RabbitMQ
// no está disponible (docs/tasks.md S1-11).
const reconnectInterval = 2 * time.Second

// ErrNotConnected indica que el publicador no tiene conexión; la sala lo
// registra y sigue jugando.
var ErrNotConnected = errors.New("publisher: RabbitMQ no está conectado")

// AMQPPublisher publica en `game.events` con mensajes persistentes y
// publisher confirms. Si RabbitMQ se cae, reconecta cada 2 segundos.
type AMQPPublisher struct {
	url string

	mu   sync.RWMutex
	conn *amqp.Connection
	ch   *amqp.Channel

	// publishMu serializa las publicaciones: un canal de AMQP no debe
	// usarse desde varias goroutines a la vez.
	publishMu sync.Mutex

	done chan struct{}
}

// NewAMQPPublisher arranca el ciclo de reconexión en segundo plano; el
// servicio no depende de que RabbitMQ esté arriba para arrancar.
func NewAMQPPublisher(url string) *AMQPPublisher {
	p := &AMQPPublisher{url: url, done: make(chan struct{})}
	go p.reconnectLoop()
	return p
}

// Publish manda el evento como JSON persistente y espera el confirm.
func (p *AMQPPublisher) Publish(
	ctx context.Context,
	routingKey string,
	payload any,
) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("publisher: JSON inválido: %w", err)
	}

	p.mu.RLock()
	ch := p.ch
	p.mu.RUnlock()
	if ch == nil {
		return ErrNotConnected
	}

	p.publishMu.Lock()
	defer p.publishMu.Unlock()

	confirm, err := ch.PublishWithDeferredConfirmWithContext(
		ctx,
		ExchangeName,
		routingKey,
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
	if err != nil {
		p.disconnect()
		return fmt.Errorf("publisher: publicando %s: %w", routingKey, err)
	}

	acked, err := confirm.WaitContext(ctx)
	if err != nil {
		return fmt.Errorf(
			"publisher: esperando confirm de %s: %w",
			routingKey,
			err,
		)
	}
	if !acked {
		return fmt.Errorf("publisher: el broker rechazó %s (nack)", routingKey)
	}
	return nil
}

// Close detiene el ciclo de reconexión y cierra la conexión.
func (p *AMQPPublisher) Close() {
	select {
	case <-p.done:
		return
	default:
	}
	close(p.done)
	p.disconnect()
}

// reconnectLoop intenta conectar de inmediato y luego cada 2 segundos.
func (p *AMQPPublisher) reconnectLoop() {
	ticker := time.NewTicker(reconnectInterval)
	defer ticker.Stop()

	p.tryConnect()
	for {
		select {
		case <-p.done:
			return
		case <-ticker.C:
			if p.connected() {
				continue
			}
			p.tryConnect()
		}
	}
}

func (p *AMQPPublisher) tryConnect() {
	conn, err := amqp.Dial(p.url)
	if err != nil {
		log.Printf(
			"publisher: RabbitMQ no responde (%v); reintento en %s",
			err,
			reconnectInterval,
		)
		return
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		log.Printf("publisher: no se pudo abrir canal: %v", err)
		return
	}

	if err := ch.ExchangeDeclare(
		ExchangeName, "topic", true, false, false, false, nil,
	); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		log.Printf("publisher: no se pudo declarar %s: %v", ExchangeName, err)
		return
	}

	if err := ch.Confirm(false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		log.Printf("publisher: no se pudo activar confirms: %v", err)
		return
	}

	p.mu.Lock()
	p.conn = conn
	p.ch = ch
	p.mu.Unlock()

	log.Printf("publisher: conectado a RabbitMQ (%s)", ExchangeName)
	p.watchClose(conn)
}

// watchClose marca la conexión como caída cuando el broker se va.
func (p *AMQPPublisher) watchClose(conn *amqp.Connection) {
	closed := conn.NotifyClose(make(chan *amqp.Error, 1))
	go func() {
		select {
		case <-p.done:
		case <-closed:
			p.disconnect()
			log.Printf("publisher: se perdió la conexión con RabbitMQ")
		}
	}()
}

func (p *AMQPPublisher) connected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.ch != nil
}

// disconnect cierra canal y conexión; el loop abrirá una nueva cuando toque.
func (p *AMQPPublisher) disconnect() {
	p.mu.Lock()
	ch, conn := p.ch, p.conn
	p.ch, p.conn = nil, nil
	p.mu.Unlock()

	if ch != nil {
		_ = ch.Close()
	}
	if conn != nil {
		_ = conn.Close()
	}
}
