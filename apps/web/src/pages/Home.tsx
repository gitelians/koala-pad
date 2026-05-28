import Coins from '../components/AllTokens'
import BestTokens from '../components/BestTokens'
import HotIcos from '../components/HotICOs'

export default function Home() {
  return (
    <div className="w-full pb-20">
      <BestTokens />

      <HotIcos />

      {/* All Tokens */}
      <Coins />
    </div>
  )
}
