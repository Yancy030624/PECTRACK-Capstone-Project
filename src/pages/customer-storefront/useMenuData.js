import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'

// Shared by PublicMenu and CustomerMenu so the fetch and the
// category-grouping are written once — the two screens differ only in
// what they let a visitor do with the result, not in how it's loaded.
export function useMenuData() {
  const [products, setProducts] = useState(null)
  const [categories, setCategories] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([apiGet('/api/products'), apiGet('/api/categories')])
      .then(([productsData, categoriesData]) => {
        setProducts(productsData.products)
        setCategories(categoriesData.categories)
      })
      .catch((error) => setMessage(error.message))
  }, [])

  const loading = products === null || categories === null

  const sections = loading ? [] : categories
    .map((category) => ({ category, items: products.filter((product) => product.categoryId === category.id) }))
    .filter((section) => section.items.length > 0)

  return { loading, sections, message }
}

export const sectionAnchor = (categoryId) => `menu-category-${categoryId}`
