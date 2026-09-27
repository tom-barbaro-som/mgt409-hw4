import { useEffect } from 'react'

const SITE_NAME = 'Campus Customs'

export function useDocumentTitle(pageTitle?: string) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : `${SITE_NAME} | Official Yale Merchandise in New Haven`
  }, [pageTitle])
}
