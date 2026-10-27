//! Tienda: el catálogo (personajes gota y accesorios) y las compras.
//!
//! Los personajes de Jimena son gratis y vienen de inicio; las gotas y los
//! accesorios solo se usan después de comprarlos. `match` valida los ids
//! (`gota-<color sin #>` y el id del accesorio) con lo que le pasa el
//! gateway, así que cambiar un id aquí obliga a cambiarlo allá.

use sqlx::PgPool;
use uuid::Uuid;

/// Colores de los jugadores (los 8 de `match`, sin el `#`).
pub const GOTA_COLORS: [&str; 8] = [
    "e6194b", "3cb44b", "ffe119", "4363d8", "f58231", "911eb4", "46f0f0",
    "f032e6",
];

/// Accesorios del paquete de sprites de la gota.
pub const ACCESSORIES: [&str; 12] = [
    "cap",
    "sprout",
    "headphones",
    "glasses",
    "straw-hat",
    "diving-mask",
    "scarf",
    "backpack",
    "helmet",
    "flower",
    "fisher-hat",
    "raincoat",
];

pub const KIND_CHARACTER: &str = "character";
pub const KIND_ACCESSORY: &str = "accessory";

/// Precios en monedas. Una partida da la cosecha más 20 si gana el equipo.
pub const GOTA_PRICE: i32 = 120;
pub const ACCESSORY_PRICE: i32 = 60;

/// Un artículo del catálogo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogItem {
    pub id: String,
    pub kind: &'static str,
    pub price: i32,
}

/// Un artículo con su estado para un jugador.
#[derive(Debug, Clone)]
pub struct ShopEntry {
    pub item: CatalogItem,
    pub owned: bool,
}

/// El catálogo y las monedas de un jugador.
#[derive(Debug, Clone)]
pub struct ShopView {
    pub coins: i32,
    pub entries: Vec<ShopEntry>,
}

/// Errores de la tienda; `grpc.rs` los traduce a `tonic::Status`.
#[derive(Debug)]
pub enum ShopError {
    PlayerNotFound,
    ItemNotFound,
    AlreadyOwned,
    NotEnoughCoins,
    Database(sqlx::Error),
}

/// Todo lo que se puede comprar: primero las gotas y luego los accesorios.
pub fn catalog() -> Vec<CatalogItem> {
    let characters = GOTA_COLORS.iter().map(|color| CatalogItem {
        id: format!("gota-{color}"),
        kind: KIND_CHARACTER,
        price: GOTA_PRICE,
    });
    let accessories = ACCESSORIES.iter().map(|id| CatalogItem {
        id: (*id).to_string(),
        kind: KIND_ACCESSORY,
        price: ACCESSORY_PRICE,
    });
    characters.chain(accessories).collect()
}

/// Catálogo con lo que ya tiene el jugador y sus monedas.
pub async fn get_shop(
    pool: &PgPool,
    player_id: Uuid,
) -> Result<ShopView, ShopError> {
    let coins: Option<i32> =
        sqlx::query_scalar("SELECT coins FROM players WHERE id = $1")
            .bind(player_id)
            .fetch_optional(pool)
            .await
            .map_err(ShopError::Database)?;
    let coins = coins.ok_or(ShopError::PlayerNotFound)?;

    let owned: Vec<String> = sqlx::query_scalar(
        "SELECT item_id FROM purchases WHERE player_id = $1",
    )
    .bind(player_id)
    .fetch_all(pool)
    .await
    .map_err(ShopError::Database)?;

    let entries = catalog()
        .into_iter()
        .map(|item| ShopEntry {
            owned: owned.contains(&item.id),
            item,
        })
        .collect();
    Ok(ShopView { coins, entries })
}

/// Compra un artículo: revisa que exista, que no lo tenga y que le alcancen
/// las monedas, y guarda la compra y el cobro en una sola transacción.
pub async fn buy_item(
    pool: &PgPool,
    player_id: Uuid,
    item_id: &str,
) -> Result<ShopView, ShopError> {
    let item = catalog()
        .into_iter()
        .find(|item| item.id == item_id)
        .ok_or(ShopError::ItemNotFound)?;

    let mut tx = pool.begin().await.map_err(ShopError::Database)?;

    // Bloquea la fila: dos compras a la vez no pueden gastar las mismas
    // monedas.
    let coins: Option<i32> = sqlx::query_scalar(
        "SELECT coins FROM players WHERE id = $1 FOR UPDATE",
    )
    .bind(player_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(ShopError::Database)?;
    let coins = coins.ok_or(ShopError::PlayerNotFound)?;

    let inserted = sqlx::query(
        "INSERT INTO purchases (player_id, item_id, price)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(player_id)
    .bind(&item.id)
    .bind(item.price)
    .execute(&mut *tx)
    .await
    .map_err(ShopError::Database)?;
    if inserted.rows_affected() == 0 {
        return Err(ShopError::AlreadyOwned);
    }
    if coins < item.price {
        return Err(ShopError::NotEnoughCoins);
    }

    sqlx::query("UPDATE players SET coins = coins - $1 WHERE id = $2")
        .bind(item.price)
        .bind(player_id)
        .execute(&mut *tx)
        .await
        .map_err(ShopError::Database)?;
    tx.commit().await.map_err(ShopError::Database)?;

    get_shop(pool, player_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_has_8_gotas_and_12_accessories() {
        let items = catalog();
        let count = |kind| items.iter().filter(|i| i.kind == kind).count();
        assert_eq!(count(KIND_CHARACTER), 8);
        assert_eq!(count(KIND_ACCESSORY), 12);
    }

    #[test]
    fn catalog_ids_are_unique() {
        let items = catalog();
        let ids: HashSet<_> = items.iter().map(|i| i.id.clone()).collect();
        assert_eq!(ids.len(), items.len());
    }

    #[test]
    fn gota_ids_match_the_ones_match_expects() {
        let ids: Vec<_> = catalog().into_iter().map(|i| i.id).collect();
        assert!(ids.contains(&"gota-e6194b".to_string()));
        assert!(ids.contains(&"gota-f032e6".to_string()));
    }

    #[test]
    fn every_price_is_positive() {
        assert!(catalog().iter().all(|i| i.price > 0));
    }
}
